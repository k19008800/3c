# ADR-0003：统一资金状态机

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：DEC-003

## 决策
- 充值订单/人工上账：`pending → pending_level2 → pending_super → paid`，按实际审批级别跳过阶段；待审核状态可转 `rejected`；入账异常转 `failed`；不使用 `approved` 中间态。
- 调账：`pending → pending_level2 → pending_super → approved`，可转 `rejected`、`failed`；生效后可转 `reversed`。
- 退款：`pending → approved → processing → completed`，支持 `rejected`、`failed`；`approved` 表示审核通过、尚未完成执行。
- 消费/API 失败退款退回用户余额且只增加一次；充值订单退款执行支付渠道原路退款，不同时余额回滚；调账/人工上账纠错使用独立反向资金记录，不使用退款语义。
- 当前版本禁止退款或红冲造成负余额；余额不足的扣减/纠错操作返回受控业务错误。
- 红冲创建独立反向资金记录；原单金额不可修改/删除；反向记录成功生效后原单才转 `reversed`。
- `approved` 仅表示调账已生效或退款审核通过待执行。

## 影响与迁移
建立状态机专章，明确数据库状态、审批阶段、展示文案、终态补偿和兼容迁移。

## 关联
`audit/08-deployment/document-decision-log.md#dec-003`
