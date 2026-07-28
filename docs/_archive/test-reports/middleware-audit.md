# T17 — 中间件审计报告

> 生成时间: 2026-06-28 09:53 CST
> 文件: `api/src/middleware/auth.ts`, `rate-limit.ts`, `log.ts`

## 1. auth.ts — 鉴权中间件

### JWT Access Token 验证

```ts
authenticateJWT(request, reply)
```

- Bearer Token 提取 ✅
- `verifyAccessToken(token)` — 验证 JWT ✅
- TokenExpiredError → 401 "Token 已过期" ✅
- 无效 Token → 401 "无效的 Token" ✅
- 无 Authorization header → 401 "缺少 Authorization header" ✅

### API Key 鉴权

```ts
authenticateApiKey(request, reply)
```

- Bearer Token 提取 ✅
- SHA-256 哈希匹配: `createHash("sha256").update(apiKey).digest("hex")` ✅
- 三表 JOIN: apiKeys + users (INNER JOIN) ✅
- Key 状态检查: `status === false` → 401 "已禁用" ✅
- Key 过期检查: `expiresAt < now` → 401 "已过期" ✅
- 用户状态检查: disabled → 403, deleted → 403 ✅
- lastUsedAt 更新 ✅
- 设置 `request.apiKey` 和 `request.user` ✅

### 角色权限检查

```ts
requireRole(...roles: string[])
```

- 返回闭包函数 ✅
- 检查 `request.user` 是否存在 → 401 ✅
- 检查 `request.user.role` 是否在 roles 中 → 403 ✅

### FastifyRequest 类型扩展

```ts
declare module "fastify" {
  interface FastifyRequest {
    user?: { userId: number; role: string };
    apiKey?: { id: number; userId: number };
  }
}
```
✅ 类型声明完整

## 2. rate-limit.ts — 限流中间件

### 架构

- 4 级: API Key → 用户 → 用户类型 → 全局兜底 ✅
- 2 维度: RPM + TPM ✅
- Redis ZSET 滑动窗口 (60 秒) ✅
- 内存缓存 120 秒刷新 ✅

### 实现细节

| 级别 | RPM Key | TPM Key | 来源 |
|------|---------|---------|------|
| API Key | `rl:rpm:key:{id}` | 无 | 写死 999999 |
| 用户 | `rl:rpm:user:{id}` | `rl:tpm:user:{id}` | config + override |
| 全局 | `rl:rpm:global:0` | `rl:tpm:global:0` | config |

### 问题发现

1. ❌ **API Key RPM 兜底名存实亡**: 阈值 = 999999，永远不会触发
2. ❌ **Redis 操作效率**: `checkRateLimit` 对每个级别都做 `zremrangebyscore` + `zcard`，4 次 RPM + 2 次 TPM = 6 次 Redis 调用。加上 `recordRequestForLimit`/`recordTokensForLimit` 的额外调用，每条请求约 10+ 次 Redis 操作
3. ⚠️ **TPM 统计精度**: `getTokenSum` 中 ZRANGE WITHSCORES 返回所有成员，在大流量下可能内存 OOM

### 缓存设计

- `configCache` 120 秒过期 ✅
- `clearRateLimitCache()` 导出 ✅
- `userLimitCache` 60 秒过期（proxy.ts 中定义） ✅

## 3. log.ts — 审计日志中间件

### 当前实现

```ts
export async function recordAuditLog(...) {
  // TODO: INSERT into audit_logs
}
```

❌ **占位实现！** 仅有函数签名和 TODO 注释，未实际实现。

### 影响

审计日志的写入当前由各路由手动实现（主要在 admin 路由），而不是通过中间件自动记录。

## 汇总

| 检查项 | 结果 |
|--------|------|
| JWT 验证 | ✅ 完整 |
| API Key 鉴权 | ✅ 完整 |
| 角色权限 | ✅ |
| 限流（RPM/TPM） | ✅ 实现完整 |
| 限流效率 | ⚠️ Redis 调用较多 |
| log.ts 审计中间件 | ❌ TODO 未实现 |
| 整体评分 | 75/100 |

**建议修复:**
1. 修复 API Key 级 RPM 阈值
2. 优化 Redis 调用（流水线/批量）
3. **完成 log.ts 中间件实现**
4. 考虑 TPM 聚合使用 SUM 而非全量读取
