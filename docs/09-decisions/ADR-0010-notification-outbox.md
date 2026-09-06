# ADR-0010：通知机制与用户偏好

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：DEC-010

## 决策
- 资金类站内通知强制发送：充值成功、人工上账到账、调账生效、退款完成、红冲完成。
- Email、SMS、Webhook 等其他渠道遵循用户偏好。
- 资金事务提交成功后写入 outbox/event，再异步发送；通知失败不回滚资金事务。
- 资金失败不得产生成功通知；重试不得造成重复可见通知。
- 状态统一为 `queued/sent/failed/skipped`，支持查询、告警、重试和人工补发。
- 事件包含 event_id、event_type、aggregate、user、amount、currency、occurred_at、idempotency_key。

## 关联
`audit/08-deployment/document-decision-log.md#dec-010`
