# 资金 API 幂等规范

- 文档 ID：API-BILLING-001
- 状态：approved
- 生效版本：v1.0.0
- 上游 ADR：ADR-0009（资金幂等）、ADR-0010（通知 outbox）、ADR-0021（审批阶段表示）、ADR-0006（余额账本）
- 关联：`conventions.md` §5、`errors.md` §2.3、`docs/06-data-and-architecture/transaction-and-concurrency.md`
- 事实来源：`api/src/services/idempotency.ts`、`docs/05-api/{user/recharge.md, admin/*.md}`、`api/src/routes/*.ts`

## 1. 范围

资金幂等覆盖以下**资金写操作**（ADR-0009）：

- **创建类**：充值订单、人工上账、调账（引号引用 `POST /api/v1/recharge`、`POST /api/v1/admin/manual-topup`、`POST /api/v1/admin/adjust`）。
- **审批/执行类**：人工上账审核通过/驳回、充值订单审核、调账各级审批/驳回/红冲、退款审核/执行/驳回、结算关账/确认/调整、对账差异补账。
- 用户自助充值与对公开户等读取/查询类端点不强制幂等。

> **表面说明**：模型消费链路（`/v1/*`、`/anthropic/v1/*`）使用 `request_id` 三层去重（L1 Redis SETNX → L2 `consumption_records.request_id` 唯一约束 → L3 回放），见 `api/src/services/idempotency.ts` 与 `coding-standards-control-logic.md`；本文档主体为**平台业务资金操作**契约（ADR-0009）。

## 2. Key 绑定（ADR-0009）

`Idempotency-Key` 请求头绑定以下因子：

- 操作者（用户/API Key 身份）
- HTTP 方法
- canonical 路径
- 请求摘要（参数/金额关键字段，如 `user_id`、`amount`、`transfer_no`、`direction`）

三因子（身份 + 方法/路径 + 摘要）共同决定一次幂等；**相同 Key + 不同摘要 → 409 `IDEMPOTENCY_CONFLICT`**，防止同一 Key 替换发起不同业务。

## 3. 行为语义

| 情形 | 行为 |
|---|---|
| 首次提交（Key 未使用） | 正常处理，记录结果影射 |
| 重复提交（同 Key + 同摘要） | 回放首次结果，不重复入账/扣费/通知 |
| 同 Key + 异摘要 | 409 `IDEMPOTENCY_CONFLICT` |
| 资金操作执行期间重试 | 等待前序完成或回放；不并发执行两次 |
| 幂等基础设施（Redis 锁）不可用 | **503 `IDEMPOTENCY_UNAVAILABLE`，不得静默绕过**（ADR-0009） |

> **与模型消费链路的差异（重要）**：模型消费链路在 Redis 不可用时**降级放行**由 DB 兜底（避免打断推理）；**资金写操作禁止降级**——资金幂等不可用时必须 503 拒绝，防止重复入账。两表面不可混用策略。

## 4. 最终边界（funds）

- **DB 唯一约束**是最底层兜底：`recharge_orders.idempotency_key`（migration 0027）防同 Key 重复创建；`metadata->>'transfer_no'` 部分唯一索引（migration 0028）防同转账单号重复入账；结算周期唯一索引 `(periodStart, periodEnd)` 防重复关账。
- **数据库事务 + 状态条件更新**（如 `WHERE status IN (pending,...)` 原子转 `paid`）确保不重复累加余额。
- **Redis 仅作加速锁**（`lib/redis.ts` 降级语义），不是资金幂等的最终保证；资金语义最终以 DB 约束与事务为准（ADR-0009）。
- 业务唯一引用（`transfer_no`、`order_no`、`request_id`）在资金操作中的使用见各主题 `05-api/admin/*.md`。

## 5. 与通知/审计的一致（ADR-0010）

- 幂等命中（回放）**不得**重复发送站内通知、不得重复写 `balance_transactions` 与审计。
- 资金事务提交成功后才写 outbox/事件；通知失败不回滚资金事务；失败不回放"成功"。
- 资金事务在 outbox 中带 `idempotency_key`（ADR-0010 事件字段），保证事件侧幂等。

## 6. 幂等错误码

| 情形 | 错误码 | HTTP | 见 |
|---|---|---|---|
| 同 Key 异摘要 | `IDEMPOTENCY_CONFLICT` | 409 | `errors.md` §2.3 |
| 同业务凭证（`transfer_no` 等） | `DUPLICATE_BUSINESS_REFERENCE` | 409 | `errors.md` §2.2 |
| 终态/重复处理 | `ORDER_ALREADY_PROCESSED` | 409 | `errors.md` §2.2 |
| 幂等基础设施不可用 | `IDEMPOTENCY_UNAVAILABLE` | 503 | `errors.md` §2.3 |

## 7. 测试映射

| 测试意图 | 期望结果 |
|---|---|
| 同 Key+同摘要重放 | 回放首次结果；`recharge_orders`/`balance_transactions` 仅 1 行；通知仅 1 次 |
| 同 Key+异摘要 | 409 `IDEMPOTENCY_CONFLICT` |
| DB 唯一约束兜底 | Redis 失效时 DB 约束拦截重复 insert → 409；资金操作**不得**降级放行 |
| `transfer_no` 唯一 | 同 `transfer_no` 二次创建 → 409 `DUPLICATE_BUSINESS_REFERENCE` |
| 结算周期唯一 | 重复关账 → 409 `CYCLE_ALREADY_CLOSED` |
| 并发审批 | 状态条件更新 → 仅一次生效，余额只加一次 |