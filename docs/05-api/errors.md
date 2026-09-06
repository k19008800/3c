# 平台业务 API 错误码

- 文档 ID：API-CORE-002
- 状态：approved
- 生效版本：v1.0.0
- 上游 ADR：ADR-0011（响应/错误结构）、ADR-0008（操作级 2FA）、ADR-0009（幂等错误）、ADR-0020（禁负余额）、ADR-0022（24h 限额）、ADR-0004/0024（权限拒绝）、ADR-0030（四项业务契约冻结）
- 事实来源：`api/src/lib/errors.ts`、`docs/05-api/{user/recharge.md, admin/finance.md, admin/manual-topup.md, admin/balance-adjustment.md, admin/refund-and-reversal.md, admin/settlement-and-reconciliation.md}`、对应 `api/src/routes/*.ts`

## 1. 统一结构（ADR-0011）

- **平台业务 API（`/api/v1/*`）错误响应**：`{ code, message, details, request_id }`；错误响应不返回业务 `data`。
- **兼容 API（`/v1/*`、`/anthropic/v1/*`）错误响应**：OpenAI/Anthropic 原生 `{ error: { message, type, code } }`，属另一表面（见 `conventions.md` §1），不在本字典覆盖范围。
- `code` 用业务错误码（下表），`message` 对人可读，`details` 可选结构化上下文。
- 调用方以 HTTP 状态码 + `code` 双重识别错误语义；对可重试错误的幂等与重试策略见最后一列。

## 2. 错误码字典

### 2.1 通用 / 认证 / 权限

| 错误码 | HTTP | 含义 | 场景 | 幂等/重试 |
|---|---|---:|---|---|
| `VALIDATION_ERROR` | 400 | 参数/业务校验失败（金额≤0/超上限/精度/method 非法/用户状态 frozen/原因缺失/传 evidence_url/审批人=申请人/阶段不匹配） | 各资金写操作的输入校验 | 修正后重试 |
| `UNAUTHORIZED` | 401 | 未登录 / Token 缺失或失效 | 需鉴权端点 | 重新认证 |
| `PERMISSION_DENIED` | 403 | 无对应权限点（`finance.topup`、`finance.adjust`、`RECONCILIATION_VIEW` 等），越权访问 | 资金/对账端点 | 不重试，申请权限 |
| `FORBIDDEN` | 403 | 无权限（`errors.ts` 别名；语义同 `PERMISSION_DENIED`，两码在既有契约中并存） | 同上 | 同上 |
| `OPERATION_2FA_REQUIRED` | 403 | 缺少或未启用操作级 2FA 令牌（ADR-0008） | 资金写操作 | 完成 2FA 后重试 |
| `OPERATION_2FA_INVALID` | 403 | 操作 2FA 令牌错误 | 同上 | 重新获取令牌 |
| `OPERATION_2FA_EXPIRED` | 403 | 操作 2FA 令牌过期 | 同上 | 重新获取令牌 |
| `OPERATION_2FA_NOT_ENABLED` | 403 | 操作者未启用操作级 2FA | 同上 | 先启用 2FA |
| `OPERATION_CONFIRM_REQUIRED` | 403 | 缺少二次确认标记（前端二次确认不能替代后端校验） | 高风险资金写操作 | 携带确认标记重试 |
| `NOT_FOUND` | 404 | 资源不存在（用户、订单、结算单等通用） | 任意 | 修正引用后重试 |

### 2.2 资金专用业务错误

| 错误码 | HTTP | 含义 | 场景 | 幂等/重试 |
|---|---|---:|---|---|
| `BALANCE_NOT_FOUND` | 404 | 用户无 `customer_balances` 账户行 | 查询/入账/扣减前校验；本期入账路径自动建户兜底后不再触发 | 触发即入账兜底 |
| `INSUFFICIENT_BALANCE` | 422 | 余额不足（**禁负余额**，ADR-0020；调整/补扣/退款扣减后为负则回滚） | 余额扣减类资金操作 | 充值后重试 |
| `PAYMENT_REQUIRED` | 402 | 兼容 API 模型消费余额不足（需支付语义） | `/v1/*`、`/anthropic/v1/*` 模型消费 | 充值后重试 |
| `DUPLICATE_BUSINESS_REFERENCE` | 409 | 业务凭证重复（如同 `transfer_no` 已在 `recharge_orders` 唯一） | 人工上账/充值创建 | 不重试，核实凭证 |
| `ORDER_ALREADY_PROCESSED` | 409 | 单据已处理（重复/并发审批、终态再操作） | 审批/执行为主端点 | 不重试，按现状查询 |
| `SOURCE_ORDER_MUTATED` | 409 | 原单金额被修改/删除（`【待人工裁决】` 是否单独定义，否则复用 `ORDER_ALREADY_PROCESSED`） | 退款/红冲 | 不重试，人工核实 |
| `CYCLE_ALREADY_CLOSED` | 409 | 结算周期已关账，重复关账 | 结算关账 | 不重试，查询现状 |
| `SETTLEMENT_STATUS_MISMATCH` | 400 | 结算单已 `settled` 再确认/调整 | 结算确认/调整 | 纠正状态后重试 |
| `SETTLEMENT_AMOUNT_NEGATIVE` | 400 | 结算调整后金额 < 0 | 结算调整 | 修正金额 |
| `SETTLEMENT_NOT_FOUND` | 404 | 结算单不存在/非本人 | 结算查询/操作 | 修正引用 |
| `DAILY_LIMIT_EXCEEDED` | 429 | 24h 滚动限额超限且 `exceed_action=reject`（ADR-0022） | 人工上账/调账创建预检 | 次日或升级后续 |
| `BALANCE_CREDIT_FAILED` | 500 | 入账/加额执行异常（事务整体回滚，理论不可达） | 入账执行 | 人工介入，重放前查流水 |

### 2.3 幂等 / 基础设施（ADR-0009）

| 错误码 | HTTP | 含义 | 幂等/重试 |
|---|---|---:|---|
| `IDEMPOTENCY_CONFLICT` | 409 | 同 `Idempotency-Key` 对应不同请求摘要（重放异摘要）；或首次请求仍在处理中 | 不重试；换 Key 或等前序完成 |
| `IDEMPOTENCY_UNAVAILABLE` | 503 | 幂等依赖（Redis 锁）不可用，**不得静默绕过** | 基础设施恢复后重试 |
| `CIRCUIT_BREAKER_OPEN` | 503 | 渠道熔断开启（`errors.ts`；用于兼容/路由表面） | 熔断恢复后重试 |
| `ORDER_CREATE_FAILED` | 500 | 订单插入失败（唯一键冲突等非预期） | 人工介入 |

### 2.4 兼容/上游（属兼容 API 表面，`/v1/*` 透传）

| 错误码 | HTTP | 含义 | 备注 |
|---|---|---:|---|
| `UPSTREAM_ERROR` | 502 | 上游供应商错误（`errors.ts`） | 兼容表面返回 `{error:{...}}` |
| `RATE_LIMIT_EXCEEDED` | 429 | 限流（`errors.ts`） | 平台与兼容表面共用 |

## 3. 其他通用 codes（`errors.ts` 已定义，按语义分类）

- `NOT_FOUND`→404、`VALIDATION_ERROR`→400、`UNAUTHORIZED`→401 已在 §2.1。
- `PRE_CONSUME_FAILED`→402（模型消费预扣失败，兼容表面 `{error}` 语义）；兼容表面余额不足统一归类为 `PAYMENT_REQUIRED`→402。平台资金操作的 `INSUFFICIENT_BALANCE` 固定为 422。

## 4. 实现差距登记（DOC_CODE_GAP）

> ADR-0030 已冻结两类 API 表面的最终契约。实现层仍可能存在旧错误码或旧分页结构，须按端点整改并补契约测试，不得将差距误报为已实现。

| 差异 | 实现（errors.ts） | 正式契约（本节） | 说明 |
|---|---|---|---|
| `INSUFFICIENT_BALANCE` HTTP | 旧实现可能为 402 | **422**（平台资金操作）；兼容消费为 **402 `PAYMENT_REQUIRED`** | 按 ADR-0030 分离语义；原生上游错误可继续透传，平台日志按 `PAYMENT_REQUIRED` 归类。 |
| 分页字段 | `pagination:{page,pageSize}` / `list` 部分实现 | `items/page/page_size/total`（ADR-0030） | 历史端点差异保留为 `DOC_CODE_GAP`，按端点迁移；新客户端不得使用 `pageSize`。 |

> 处理原则（ADR-0017）：契约文档为准绳，实现差异**不静默**，登记为差距待整改；禁止编造"已实现"来掩盖未对齐。具体整改与排期见 `00-index/open-issues.md`。

## 5. 与各主题契约的映射

| 主题 | 主要错误码（详见对应 API 文档） |
|---|---|
| 充值/人工上账 | `VALIDATION_ERROR`、`UNAUTHORIZED`、`PERMISSION_DENIED`/`FORBIDDEN`、`OPERATION_2FA_*`、`NOT_FOUND`、`IDEMPOTENCY_CONFLICT`、`DUPLICATE_BUSINESS_REFERENCE`、`ORDER_ALREADY_PROCESSED`、`DAILY_LIMIT_EXCEEDED`、`BALANCE_CREDIT_FAILED`、`ORDER_CREATE_FAILED`、`IDEMPOTENCY_UNAVAILABLE` |
| 调账 | 同上 + `OPERATION_CONFIRM_REQUIRED`、`DAILY_LIMIT_EXCEEDED` |
| 退款/红冲 | 上述 + `INSUFFICIENT_BALANCE`(422)、`BALANCE_NOT_FOUND`、`SOURCE_ORDER_MUTATED` |
| 结算/对账 | `SETTLEMENT_STATUS_MISMATCH`、`SETTLEMENT_AMOUNT_NEGATIVE`、`SETTLEMENT_NOT_FOUND`、`CYCLE_ALREADY_CLOSED`、`INSUFFICIENT_BALANCE`、`BALANCE_NOT_FOUND` |

## 6. 兼容性

- 新增 code 不重用既有 HTTP 状态但语义冲突的码；废弃/合并 code 须先登记 `00-index/open-issues.md`。
- 对外稳定承诺：`/api/v1/*` 已发布 code 在 `v1.x` 内不删除、不改变 HTTP 语义；`v2.0.0` 起可清理（ADR-0023 兼容口径）。
