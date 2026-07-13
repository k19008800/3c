#!/bin/bash
# ============================================================
#  3cloud (3C) — 全链路业务验证脚本
#  验证所有功能点：登录 → 用户管理 → 模型/厂商 → 代理 → 计费 → 安全
#  用法: bash tests/verify-3cloud.sh (或 source)
# ============================================================

API="http://localhost:3000"
PASS=0
FAIL=0
TOTAL=0
declare -a RESULTS

BASE_URL="$API"

echo "============================================"
echo "  3cloud 全链路业务验证报告"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================"
echo ""

# Helper
check() {
    local name="$1"
    local expected="$2"
    local actual="$3"
    TOTAL=$((TOTAL + 1))
    if echo "$actual" | grep -q "$expected"; then
        echo "  ✅ $name"
        RESULTS+=("PASS|$name")
        PASS=$((PASS + 1))
    else
        echo "  ❌ $name"
        echo "     期望: $expected"
        echo "     实际: $actual"
        RESULTS+=("FAIL|$name")
        FAIL=$((FAIL + 1))
    fi
}

login_check() {
    local name="$1"
    local expected="$2"
    local actual="$3"
    TOTAL=$((TOTAL + 1))
    if echo "$actual" | grep -q "$expected"; then
        echo "  ✅ $name"
        RESULTS+=("PASS|$name")
        PASS=$((PASS + 1))
    else
        echo "  ❌ $name"
        echo "     期望: $expected"
        echo "     实际: $(echo "$actual" | head -c 200)"
        RESULTS+=("FAIL|$name")
        FAIL=$((FAIL + 1))
    fi
}

# ════════════════════════════════════════════════════════════
#  1. 健康检查
# ════════════════════════════════════════════════════════════
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  1. 系统健康检查"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "  → 检查 API 存活..."
R=$(curl -s "$BASE_URL/health")
check "GET /health: API 存活" '"status":"ok"' "$R"

echo "  → 检查就绪状态..."
R=$(curl -s "$BASE_URL/ready")
login_check "GET /ready: 就绪检查" '"status":"ready"' "$R"

# ════════════════════════════════════════════════════════════
#  2. 用户认证
# ════════════════════════════════════════════════════════════
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  2. 用户认证系统"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "  → 管理员登录..."
ADMIN_LOGIN=$(curl -s "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@3cloud.ai","password":"Admin1234!"}')
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | grep -o '"accessToken":"[^"]*"' | head -1 | cut -d'"' -f4)
login_check "POST /api/v1/auth/login: 管理员登录成功" '"accessToken"' "$ADMIN_LOGIN"

echo "  → 获取管理员信息..."
R=$(curl -s "$BASE_URL/api/v1/auth/me" -H "Authorization: Bearer $ADMIN_TOKEN")
login_check "GET /api/v1/auth/me: 获取用户信息" '"role":"super_admin"' "$R"

echo "  → 普通用户登录..."
USER_LOGIN=$(curl -s "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"client-game-npc@3c.local","password":"Client1234!"}')
USER_TOKEN=$(echo "$USER_LOGIN" | grep -o '"accessToken":"[^"]*"' | head -1 | cut -d'"' -f4)
login_check "POST /api/v1/auth/login: 普通用户登录" '"accessToken"' "$USER_LOGIN"

# ════════════════════════════════════════════════════════════
#  3. 管理员 — 用户管理
# ════════════════════════════════════════════════════════════
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  3. 管理员 — 用户管理"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "  → 用户列表..."
R=$(curl -s "$BASE_URL/api/v1/admin/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json")
login_check "GET /api/v1/admin/users: 用户列表" '"code":0' "$R"

echo "  → 用户详情..."
USER_ID=$(echo "$USER_LOGIN" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
R=$(curl -s "$BASE_URL/api/v1/admin/users/$USER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
login_check "GET /api/v1/admin/users/:id: 用户详情" '"code":0' "$R"

echo "  → 用户列表(已实名)筛选..."
R=$(curl -s "$BASE_URL/api/v1/admin/users?realNameStatus=approved" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
login_check "筛选已实名用户" '"code":0' "$R"

echo "  → 用户列表(余额区间)筛选..."
R=$(curl -s "$BASE_URL/api/v1/admin/users?minBalance=1000&maxBalance=100000" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
login_check "余额区间筛选用户" '"code":0' "$R"

echo "  → 导出用户..."
R=$(curl -s "$BASE_URL/api/v1/admin/users/export" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"format":"csv"}')
login_check "POST /api/v1/admin/users/export: 导出用户" '"code":0' "$R"

echo "  → 模拟登录..."
R=$(curl -s "$BASE_URL/api/v1/admin/users/impersonate" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":$USER_ID}")
login_check "POST /api/v1/admin/users/impersonate: 模拟登录" '"code":0' "$R"

# ════════════════════════════════════════════════════════════
#  4. 管理员 — 实名审核
# ════════════════════════════════════════════════════════════
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  4. 实名审核系统"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "  → 待审核列表..."
R=$(curl -s "$BASE_URL/api/v1/admin/reviews" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
login_check "GET /api/v1/admin/reviews: 待审核列表" '"code":0' "$R"

# ════════════════════════════════════════════════════════════
#  5. API Key 管理
# ════════════════════════════════════════════════════════════
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  5. API Key 管理"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "  → 用户API Key列表..."
R=$(curl -s "$BASE_URL/api/v1/keys" \
  -H "Authorization: Bearer $USER_TOKEN")
login_check "GET /api/v1/keys: Key列表" '"code":0' "$R"

echo "  → 创建API Key..."
R=$(curl -s -X POST "$BASE_URL/api/v1/keys" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"测试Key","expiresInDays":365}')
login_check "POST /api/v1/keys: 创建Key" '"code":0' "$R"
