#!/bin/bash
# ============================================================
# 3cloud 部署脚本（pnpm monorepo 版）— P3-3
# 用法: ./deploy.sh [branch=main]
# ⚠️ 受部署闸门约束：仅当 P0-P3 全部本地验收通过后才允许执行
# 目标：生产服 117.78.2.66（Ubuntu 22.04，宝塔面板）
# ============================================================
set -euo pipefail

BRANCH=${1:-main}
PROJECT_DIR="/root/3cloud"
API_DIR="$PROJECT_DIR/api"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/3cloud}"
LOG_PREFIX="[3cloud-deploy]"

echo "$LOG_PREFIX 部署开始 branch=$BRANCH time=$(date)"

# 0. 前置检查：部署闸门（防跳过）
if [ ! -f "$PROJECT_DIR/.deploy-gate-approved" ]; then
  echo "❌ 部署闸门未通过：缺少 .deploy-gate-approved 标记（调度-agent 本地全量验收后才可创建）"
  exit 1
fi

# 1. 拉取代码
cd "$PROJECT_DIR"
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

# Load production variables for build-time migrations and runtime checks.
if [ ! -f "$API_DIR/.env" ]; then
  echo "❌ missing $API_DIR/.env (production config must be created first)"
  exit 1
fi
set -a
. "$API_DIR/.env"
set +a

# 2. 安装依赖（pnpm workspace）
corepack enable 2>/dev/null || true
pnpm install --frozen-lockfile

# 3. 构建（先把 Console dist 合入 Portal /app，再构建全部包）
node scripts/prepare-app.cjs
pnpm build

# 4. 数据库备份 + 迁移
echo "$LOG_PREFIX 迁移前备份..."
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/threecloud_v3-$(date +%Y%m%d-%H%M%S).dump"
pg_dump --dbname="$DATABASE_URL" --format=custom --file="$BACKUP_FILE"
echo "✅ backup: $BACKUP_FILE"

echo "$LOG_PREFIX 应用 drizzle journal migrations..."
pnpm --filter @3cloud/api db:migrate
echo "$LOG_PREFIX 应用 hand-written migrations 0017-0032..."
(cd "$API_DIR" && pnpm run db:migrate:manual)

# 5. PM2 部署 API + Portal
cd "$PROJECT_DIR"
mkdir -p /var/log/3cloud
pm2 reload deploy/ecosystem.config.cjs --update-env || pm2 start deploy/ecosystem.config.cjs --env production

# 6. 同步前端产物到 Nginx 目录
# web-console dist 已由 prepare-app 合入 web-portal/public/app/，web-portal build 后整体部署
# 实际路径以生产 nginx 配置为准（宝塔 /www/wwwroot/3c/）
# rsync -a --delete "$PROJECT_DIR/web-portal/.next/standalone/" /www/wwwroot/3c/portal/
# rsync -a --delete "$PROJECT_DIR/web-portal/.next/static/" /www/wwwroot/3c/portal/_next/static/

# 7. 验证
sleep 3
curl -sf http://localhost:3000/health | grep -q '"status":"ok"' && echo "✅ 健康检查通过" || { echo "❌ 健康检查失败"; exit 1; }
curl -sf http://localhost:3000/docs -o /dev/null && echo "✅ Swagger 可访问" || echo "⚠️ Swagger 不可访问（检查）"

echo "$LOG_PREFIX 部署完成 time=$(date)"
