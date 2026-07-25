#!/bin/bash

echo "=== 验证 API 密钥过期功能实现 ==="
echo ""

# 1. 检查数据库 schema
echo "1. 检查数据库 schema..."
if grep -q "expiresAt: timestamp" api/src/db/schema/api-keys.ts; then
  echo "✅ expires_at 字段存在"
else
  echo "❌ expires_at 字段不存在"
fi

# 2. 检查 schema 验证
echo ""
echo "2. 检查 schema 验证..."
if grep -q "expiresAt: z.string().datetime().optional()" api/src/schemas/api-keys.ts; then
  echo "✅ createApiKeySchema 支持 expiresAt"
else
  echo "❌ createApiKeySchema 不支持 expiresAt"
fi

if grep -q "expiresAt: z.string().datetime().nullable().optional()" api/src/schemas/api-keys.ts; then
  echo "✅ updateApiKeySchema 支持 expiresAt"
else
  echo "❌ updateApiKeySchema 不支持 expiresAt"
fi

# 3. 检查路由
echo ""
echo "3. 检查路由..."
if grep -q "expiresAt: parsed.expiresAt" api/src/routes/api-keys.ts; then
  echo "✅ 创建路由支持 expiresAt"
else
  echo "❌ 创建路由不支持 expiresAt"
fi

if grep -q "parsed.expiresAt !== undefined" api/src/routes/api-keys.ts; then
  echo "✅ 更新路由支持 expiresAt"
else
  echo "❌ 更新路由不支持 expiresAt"
fi

# 4. 检查过期验证
echo ""
echo "4. 检查过期验证..."
if grep -q "key.expiresAt && key.expiresAt < new Date()" api/src/services/api-key-auth-service.ts; then
  echo "✅ 实时过期验证存在"
else
  echo "❌ 实时过期验证不存在"
fi

# 5. 检查定时任务
echo ""
echo "5. 检查定时任务..."
if [ -f "api/src/jobs/disable-expired-api-keys.ts" ]; then
  echo "✅ 定时任务文件存在"
else
  echo "❌ 定时任务文件不存在"
fi

if grep -q "disableExpiredApiKeys" api/src/app/index.ts; then
  echo "✅ 定时任务已注册"
else
  echo "❌ 定时任务未注册"
fi

# 6. 检查前端组件
echo ""
echo "6. 检查前端组件..."
if grep -q "newKeyExpiry" web/src/pages/ApiKeys.tsx; then
  echo "✅ 前端支持过期时间选择"
else
  echo "❌ 前端不支持过期时间选择"
fi

if grep -q "getRemainingTime" web/src/pages/ApiKeys.tsx; then
  echo "✅ 前端支持剩余时间显示"
else
  echo "❌ 前端不支持剩余时间显示"
fi

echo ""
echo "=== 验证完成 ==="
