# T2 — API Keys 路由审计报告

> 生成时间: 2026-06-28 09:53 CST
> 文件: `api/src/routes/api-keys.ts`
> 依赖: `api/src/middleware/auth.ts`, `api/src/schemas.ts`, `api/src/db/schema.ts`

## 端点覆盖

| 端点 | 方法 | preHandler | Schema | 状态 |
|------|------|-----------|--------|------|
| `/api/v1/api-keys` | POST | authenticateJWT | createApiKeySchema | ✅ |
| `/api/v1/api-keys` | GET | authenticateJWT | 手动分页 | ✅ |
| `/api/v1/api-keys/:id` | PATCH | authenticateJWT | updateApiKeySchema | ✅ |
| `/api/v1/api-keys/:id` | DELETE | authenticateJWT | 无 | ✅ |

## SHA-256 哈希存储

**实现:** 
```ts
const rawKey = `sk-3c-${randomBytes(48).toString("hex")}`;
const keyHash = createHash("sha256").update(rawKey).digest("hex");
const keyPrefix = rawKey.slice(0, 8);
```

- 48 字节随机 = 96 hex 字符 + "sk-3c-" 前缀 = 103 字符密钥 ✅
- SHA-256 不可逆存储 ✅
- keyPrefix 前 8 字符用于 UI 展示 ✅
- 创建响应中返回明文 key（仅一次） ✅

## 权限控制

- 所有端点使用 `authenticateJWT` ✅
- 查询/更新/删除均以 `request.user!.userId` 过滤 ✅
- 用户只能操作自己的 Key ✅
- `updateApiKeySchema` 校验 name(status, max(100)) 和 status(boolean) ✅

## 软删除

❌ **实际使用物理删除** (`db.delete(apiKeys)...`)，但 schema 中 `api_keys` 表无 `deletedAt` 字段，所以物理删除是合理的设计选择。但如果需要恢复/审计，缺软删除。

## 分页逻辑

- 默认 page=1, pageSize=20 ✅
- 无参数校验边界（parseInt 可产生 NaN，但 || 保底） ✅
- 总数查询使用 `sql\`count(*)\`` ✅

## 响应格式

- 创建: `{ code: 0, data: { id, name, key, keyPrefix, expiresAt }, message: "ok" }` ✅
- 列表: `{ code: 0, data: { list, total, page, pageSize }, message: "ok" }` ✅
- 更新: `{ code: 0, data: null, message: "ok" }` ✅
- 删除: `{ code: 0, data: null, message: "ok" }` ✅

## 错误处理

- 404 处理 ✅ (api key 不存在)
- ZodError 处理 ✅ (400 + message)
- AppError 未在路由中使用（使用场景在 service 层）✅

## 汇总

| 检查项 | 结果 |
|--------|------|
| 端点全覆盖 | ✅ 4/4 |
| SHA-256 哈希 | ✅ |
| 权限隔离 | ✅ 用户隔离 |
| 物理删除（无软删除） | ⚠️ 设计一致性 |
| Zod Schema | ✅ |
| 响应格式 | ✅ |
| 整体评分 | 90/100 |

**建议修复:**
1. 考虑软删除支持（添加 deletedAt 字段）
2. ACTIVE/PATCH 支持修改 status (已支持 boolean)
