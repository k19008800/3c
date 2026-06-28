# T4 — Recharge 路由审计报告

> 生成时间: 2026-06-28 09:53 CST
> 文件: `api/src/routes/recharge.ts`
> 依赖: `api/src/services/recharge-service.ts`, `api/src/schemas.ts`, `api/src/middleware/auth.ts`

## 端点覆盖

| 端点 | 方法 | preHandler | Schema | 状态 |
|------|------|-----------|--------|------|
| `/api/v1/recharge` | POST | authenticateJWT | rechargeSchema | ✅ |
| `/api/v1/recharge/bank-transfer` | POST | authenticateJWT | bankTransferSchema | ✅ |
| `/api/v1/recharge/orders` | GET | authenticateJWT | 手动分页 | ✅ |
| `/api/v1/recharge/:id/cancel` | POST | authenticateJWT | 无 | ✅ |
| `/api/v1/recharge/notify` | POST | 无 | 手动校验 | ✅ |

## DECIMAL(18,6) 字符串处理

- `rechargeSchema.amount`: `z.string().min(1)` — 金额作为字符串传入 ✅
- `bankTransferSchema.amount`: `z.string().min(1)` ✅
- 后端 service 负责字符串到 numeric 转换 ✅

## 支付流程完整性

- 在线支付: rechargeSchema → createRechargeOrder ✅
- 响应含 orderNo, payUrl, payParams ✅
- 对公转账: bankTransferSchema → submitBankTransfer ✅
- 状态管理: pending → paid/cancelled/confirmed/refunded ✅

## 回调安全

**问题发现:** ❌ 支付回调 `/api/v1/recharge/notify` 无任何鉴权！
```ts
// TODO: 生产环境加入签名校验
```
- 无 authenticateJWT
- 手动参数校验仅检查 orderNo, channelOrderNo, amount 存在
- `sign` 参数虽接收但不校验
- 任何人可以伪造回调

另外，回调的响应格式不一致：
- 正常返回: `reply.type("text/plain").send("SUCCESS")` ✅ (微信/支付宝要求的格式)
- 错误时: `reply.status(err.statusCode).send(err.message)` — 未包装为 `{code, data, message}` ❌

## 订单管理

- 订单列表支持 status 筛选 ✅
- 取消订单检查状态 (仅 pending 可取消) ✅
- expire 机制通过 expiresAt 字段（30分钟）✅

## Schema 校验

- `rechargeSchema`: amount + channel enum ✅
- `bankTransferSchema`: amount + bankName + accountNumber + transferDate + remark ✅

## Error 处理

- AppError + ZodError + 兜底 throw ✅

## 汇总

| 检查项 | 结果 |
|--------|------|
| 端点全覆盖 | ✅ 5/5 |
| DECIMAL(18,6) | ✅ |
| 支付流程 | ✅ |
| 回调签名 | ❌ TODO |
| 回调鉴权 | ❌ 无鉴权 |
| Zod Schema | ✅ |
| 响应格式 | ⚠️ 回调不一致 |
| 整体评分 | 65/100 |

**建议修复:**
1. **紧急**: 实现支付回调签名校验
2. 回调错误响应格式统一
3. notify 端点添加 IP 白名单或 HMAC 签名验证
