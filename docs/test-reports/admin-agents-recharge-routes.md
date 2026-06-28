# T11 — Admin Agents & Recharge 路由审计报告

> 生成时间: 2026-06-28 09:53 CST
> 文件: `api/src/routes/admin/agents.ts`, `api/src/routes/admin/recharge-admin.ts`

## 端点覆盖 — agents.ts

| 端点 | 方法 | preHandler | Schema | 状态 |
|------|------|-----------|--------|------|
| `/api/v1/admin/agents` | GET | authenticateJWT + requireRole | 手动分页 | ✅ |
| `/api/v1/admin/agents` | POST | authenticateJWT + requireRole | createAgentSchema | ✅ |
| `/api/v1/admin/agents/:id` | PATCH | authenticateJWT + requireRole | updateAgentSchema (手动) | ✅ |
| `/api/v1/admin/withdraws` | GET | authenticateJWT + requireRole | 手动分页 | ✅ |
| `/api/v1/admin/withdraws/:id/review` | POST | authenticateJWT + requireRole | reviewWithdrawSchema | ✅ |

## 端点覆盖 — recharge-admin.ts

| 端点 | 方法 | preHandler | 状态 |
|------|------|-----------|------|
| `/api/v1/admin/recharge-orders` | GET | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/recharge-orders/:id` | GET | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/recharge-orders/:id/confirm` | POST | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/recharge-orders/:id/cancel` | POST | authenticateJWT + requireRole | ✅ |

## 代理商管理

- createAgentSchema: userId + commissionRate (string) ✅
- updateAgent 支持 commissionRate + status ✅
- reviewWithdrawSchema: action (approve/reject) + rejectReason ✅

## 充值订单确认

- confirmBankTransfer 调用于 recharge-service ✅
- 对公转账确认流程完整 ✅

## 审计日志

- 取消订单记录 auditLogs ✅
- 提现审核通过 service 层记录日志 ✅

## Schema 校验

- agents: createAgentSchema + reviewWithdrawSchema ✅
- recharge-admin: 无 Zod Schema，手动校验 ✅

## 汇总

| 检查项 | 结果 |
|--------|------|
| 端点全覆盖 | ✅ 9/9 |
| 管理员权限 | ✅ |
| Zod Schema | ✅ agents, ⚠️ recharge-admin |
| 审计日志 | ✅ |
| 整体评分 | 88/100 |

**建议修复:**
1. recharge-admin 路由添加 Zod Schema
