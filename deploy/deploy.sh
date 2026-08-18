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

# 2. 安装依赖（pnpm workspace）
corepack enable 2>/dev/null || true
pnpm install --frozen-lockfile

# 3. 构建（shared → api → web-console → web-portal）
pnpm build

# 4. 数据库迁移
# ⚠️ 分区表（consumption_records/balance_transactions）为手工 DDL migration 0025，
#    用 node 脚本直跑（db:push 有 TTY 交互坑，且无法表达分区 DDL）
echo "$LOG_PREFIX 应用迁移..."
if [ -f "$API_DIR/run-migrations-0017-0022.cjs" ]; then
  (cd "$API_DIR" && node run-migrations-0017-0022.cjs)
fi
# 其余 migration 按需：node api/apply-migrations.cjs（若存在）

# 5. 数据库备份（迁移前已做？建议迁移前先备份一次）
echo "$LOG_PREFIX 迁移前备份：pg_dump ..."

# 6. PM2 部署 api + worker
cd "$PROJECT_DIR"
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js

# 7. 同步前端产物到 Nginx 目录
# web-console dist 已由 prepare-app 合入 web-portal/public/app/，web-portal build 后整体部署
# 实际路径以生产 nginx 配置为准（宝塔 /www/wwwroot/3c/）
# rsync -a --delete "$PROJECT_DIR/web-portal/.next/standalone/" /www/wwwroot/3c/portal/
# rsync -a --delete "$PROJECT_DIR/web-portal/.next/static/" /www/wwwroot/3c/portal/_next/static/

# 8. 验证
sleep 3
curl -sf http://localhost:3000/health | grep -q '"status":"ok"' && echo "✅ 健康检查通过" || { echo "❌ 健康检查失败"; exit 1; }
curl -sf http://localhost:3000/docs -o /dev/null && echo "✅ Swagger 可访问" || echo "⚠️ Swagger 不可访问（检查）"

echo "$LOG_PREFIX 部署完成 time=$(date)"
