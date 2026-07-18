#!/bin/bash
# ============================================================
#  3cloud (3C) 生产部署脚本
#  用法: bash deploy.sh [prod|prod2] [api|web|all]
#  示例: bash deploy.sh prod web    # 仅部署前端到主生产服
#        bash deploy.sh prod all    # 部署全部到主生产服
# ============================================================
set -e

MODE="${1:-prod}"
SCOPE="${2:-all}"

# ── 服务器配置 ──
declare -A HOSTS
HOSTS[prod]="root@117.78.2.66"
HOSTS[prod2]="root@123.60.55.62"

declare -A SSH_KEYS
SSH_KEYS[prod]="~/.ssh/3cloud_prod"
SSH_KEYS[prod2]="~/.ssh/3cloud_prod2"

declare -A WEB_ROOTS
WEB_ROOTS[prod]="/www/wwwroot/3c/web/dist"
# 注意: prod2 Nginx 直接服务 /3cloud/web/dist，不是独立目录
WEB_ROOTS[prod2]="/3cloud/web/dist"

HOST="${HOSTS[$MODE]}"
KEY="${SSH_KEYS[$MODE]}"
WEB_ROOT="${WEB_ROOTS[$MODE]}"
SRC_ROOT="/3cloud"

echo "=========================================="
echo "  3cloud 部署 - 目标: $MODE ($HOST)"
echo "  范围: $SCOPE"
echo "=========================================="

# ── 1. Web 前端 ──
deploy_web() {
  echo ""
  echo ">>> [Web] 构建前端..."
  cd "$SRC_ROOT/web"
  npm run build

  echo ">>> [Web] 上传到 $WEB_ROOT ..."
  # 使用 rsync 以保留孤儿文件检测能力
  # 先拷贝新文件，再清理不在源目录的旧文件
  cp -r dist/* "$WEB_ROOT/"

  echo ">>> [Web] 清理孤儿文件..."
  cd "$WEB_ROOT"
  for f in assets/*.js assets/*.css assets/*.map; do
    [ -f "$f" ] || continue
    base=$(basename "$f")
    if [ ! -f "$SRC_ROOT/web/dist/assets/$base" ]; then
      echo "  清理: $base"
      rm -f "$f"
    fi
  done

  # 同步根目录文件（index.html, favicon 等）
  for f in index.html favicon.svg logo.svg manifest.json robots.txt; do
    [ -f "$SRC_ROOT/web/dist/$f" ] && cp "$SRC_ROOT/web/dist/$f" "$f" 2>/dev/null || true
  done

  echo ">>> [Web] 部署完成 ✓"
}

# ── 2. API 后端 ──
deploy_api() {
  echo ""
  echo ">>> [API] 构建后端..."
  cd "$SRC_ROOT/api"
  npm run build

  echo ">>> [API] 重启服务..."
  pm2 restart 3cloud-api --update-env

  echo ">>> [API] 部署完成 ✓"
}

# ── 3. 数据库迁移 ──
deploy_db() {
  echo ""
  echo ">>> [DB] 运行数据库迁移..."
  cd "$SRC_ROOT/api"
  npx tsx src/db/migrate.ts

  echo ">>> [DB] 迁移完成 ✓"
}

# ── 执行 ──
if [ "$SCOPE" = "web" ] || [ "$SCOPE" = "all" ]; then
  deploy_web
fi

if [ "$SCOPE" = "api" ] || [ "$SCOPE" = "all" ]; then
  deploy_api
fi

if [ "$SCOPE" = "db" ]; then
  deploy_db
fi

echo ""
echo "=========================================="
echo "  部署完成: $MODE - $SCOPE"
echo "=========================================="
