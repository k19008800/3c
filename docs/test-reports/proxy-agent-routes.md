# T6 — Proxy & Agent 路由审计报告

> 生成时间: 2026-06-28 09:53 CST
> 文件: `api/src/routes/proxy.ts`, `api/src/routes/agent.ts`
> 依赖: `api/src/services/router.ts`, `api/src/services/billing.ts`, `api/src/services/agent-service.ts`

## Proxy 端点覆盖

| 端点 | 方法 | preHandler | Schema | 状态 |
|------|------|-----------|--------|------|
| `/api/v1/chat/completions` | POST | authenticateApiKey + checkRateLimit | chatCompletionSchema | ✅ |
| `/api/v1/embeddings` | POST | authenticateApiKey + checkRateLimit | embeddingsSchema | ✅ |

## Agent 端点覆盖

| 端点 | 方法 | preHandler | Schema | 状态 |
|------|------|-----------|--------|------|
| `/api/v1/agent/dashboard` | GET | authenticateJWT | 无 | ✅ |
| `/api/v1/agent/clients` | GET | authenticateJWT | 手动分页 | ✅ |
| `/api/v1/agent/commissions` | GET | authenticateJWT | 手动分页 | ✅ |
| `/api/v1/agent/withdraw` | POST | authenticateJWT | agentWithdrawSchema | ✅ |
| `/api/v1/agent/withdraws` | GET | authenticateJWT | 手动分页 | ✅ |

## 路由引擎调用链

Proxy 路由实现:
1. `authenticateApiKey` — API Key 鉴权 (SHA-256) ✅
2. `checkRateLimit` — 限流预检查 (Redis 滑动窗口) ✅
3. `resolveModel` — 查询模型 ID ✅
4. `selectRoute` — 路由选择 (权重+健康) ✅
5. `forwardRequest` / `forwardStreamRequest` — 转发到上游 ✅
6. `charge` — 计费扣减 ✅
7. `updateHealthAfterCall` — 被动健康检测 ✅
8. `recordTokensForLimit` — 更新 TPM 窗口 ✅

## 限流逻辑

- 4 级: API Key → 用户 → 用户类型 → 全局 ✅
- 2 维度: RPM + TPM ✅
- Redis ZSET 滑动窗口 ✅
- 用户级缓存 (60s) ✅

**问题:** API Key 级 RPM 阈值写死 `999999`，实际不会触发限制。用户级 RPM/TPM 为真正限制点。

## 流式处理

- `handleStreamingChat` 使用 SSE + Readable.fromWeb 转换 ✅
- 客户端断连检测 (request.raw.on("close")) ✅
- 流结束计费 (usagePromise) ✅
- cancelled 状态记录 ✅

## 费率计算

- costPrice 为上游成本，sellPrice 为售价 ✅
- 售价 = costPrice * pricing_multiplier(1.33) ✅
- 计算逻辑在 `billing.ts` 的 `calculateCost` 中 ✅

## 余额扣减

- `charge` 服务负责：扣减 balance + 记录 balanceLogs + commission_logs ✅
- 上游错误时不扣费 ✅

## 代理分佣

- Agent 路由仅提供查询功能 ✅
- 分佣逻辑在 billing/agent-service 中 ✅
- agentWithdrawSchema: amount (string) ✅

## 错误处理

Proxy 使用 OpenAI 兼容错误格式:
```ts
{ error: { message, type, code } }
```
- ZodError → 400 + "invalid_request_error" ✅
- AppError → statusCode + error type ✅
- 上游错误 → 透传 status code ✅

## 用户限流缓存

- `userLimitCache` Map 实现 ✅
- 60 秒过期 ✅
- `clearUserLimitCache()` 导出供外部调用 ✅

## 汇总

| 检查项 | 结果 |
|--------|------|
| 端点全覆盖 | ✅ 7/7 |
| API Key 鉴权 | ✅ |
| 限流系统 | ✅ |
| 流式/非流式 | ✅ |
| 费率计算 | ✅ |
| 余额扣减 | ✅ |
| 分佣逻辑 | ✅ |
| 错误格式 | ✅ OpenAI 兼容 |
| 整体评分 | 92/100 |

**建议修复:**
1. API Key 级 RPM 不应写死 999999
2. 考虑用户缓存刷新机制在生产环境缓存雪崩问题
