# ADR-0009：资金操作幂等

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：DEC-009

## 决策
- 创建类资金操作强制 `Idempotency-Key`：`POST /api/v1/recharge`、`POST /api/v1/admin/manual-topup`、`POST /api/v1/admin/adjust`。
- 审批、红冲、退款等资金写操作纳入统一幂等规范，并执行状态条件更新。
- Key 绑定操作者、方法、canonical 路径和请求摘要；相同 Key/摘要回放首次结果，不同摘要返回 `409 IDEMPOTENCY_CONFLICT`。
- 业务唯一约束继续保留；Redis 仅作加速锁，数据库约束、事务和状态守卫是最终边界。
- Redis 不可用不得静默绕过，返回 `503 IDEMPOTENCY_UNAVAILABLE`。
- 重复凭证和已处理单据分别返回 `DUPLICATE_BUSINESS_REFERENCE`、`ORDER_ALREADY_PROCESSED`。

## 关联
`audit/08-deployment/document-decision-log.md#dec-009`
