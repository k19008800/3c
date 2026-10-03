# PRD §14 错误码与统一错误响应

> 品牌：**浩寅云**　|　代码基线：2026-10-03 工作区
> 状态图例：✅已实现｜🟡部分实现｜❌未实现（规划中）
> 权威来源：`api/src/lib/errors.ts`（AppError 体系）。

---

## 一、统一错误响应格式（✅）

后端所有可预期错误由 `AppError` 基类统一抛出，三要素：

```json
{ "error": { "code": "STRING_CODE", "message": "面向用户的中文说明", "context": { ... } } }
```

| 字段 | 含义 |
|---|---|
| `statusCode` | HTTP 状态码 |
| `code` | 机器可读错误码（大写下划线，前端据此分支处理） |
| `message` | 面向用户的中文文案（已含引导，如「请前往充值页」） |
| `context` | 可选结构化上下文（余额/限额/requestId 等） |

工具函数：`isAppError(err)` 判定、`errorInfo(err)` 抽取 name/message/statusCode/code 供日志。

---

## 二、错误码枚举（与代码一一对应）

### 2.1 认证与授权

| code | HTTP | 类 | 语义 |
|---|---|---|---|
| `UNAUTHORIZED` | 401 | UnauthorizedError | 未登录 / token 缺失或失效 |
| `FORBIDDEN` | 403 | ForbiddenError | 已登录但无权限（角色/归属校验失败） |
| `DATA_EXPORT_NOT_GRANTED` | 403 | DataExportNotGrantedError | 数据导出未获后台授权（download 不受限） |

### 2.2 资源与校验

| code | HTTP | 类 | 语义 |
|---|---|---|---|
| `NOT_FOUND` | 404 | NotFoundError | 资源不存在（可带资源名与 id） |
| `VALIDATION_ERROR` | 400 | ValidationError | 参数校验失败（含 context 字段明细） |

### 2.3 计费 / 预算 / 余额

| code | HTTP | 类 | 语义 |
|---|---|---|---|
| `INSUFFICIENT_BALANCE` | 402 | InsufficientBalanceError | 事后扣费路径余额不足（deductBalance），含当前/所需金额 |
| `PRE_CONSUME_FAILED` | 402 | PreConsumeFailedError | 请求前预扣冻结失败（转发上游前，不产生消费记录） |
| `PAYMENT_REQUIRED` | 402 | PaymentRequiredError | 兼容表面（/v1/*、/anthropic/v1/*）余额缺额（D-01 裁决，与平台资金操作的 422 解耦） |
| `BUDGET_LIMIT_EXCEEDED` | 429 | BudgetLimitExceededError | **§20.1 用户预算熔断**：今日/本月已用+预估超上限且 hard_block（网关 pre-consume 前检查，Step 4 新增） |

### 2.4 上游 / 限流 / 熔断

| code | HTTP | 类 | 语义 |
|---|---|---|---|
| `UPSTREAM_ERROR` | 502 | UpstreamError | 上游/中继错误（带 upstreamStatus） |
| `RATE_LIMIT_EXCEEDED` | 429 | RateLimitError | 限流触发（RPM/TPM/24h 窗口等） |
| `CIRCUIT_BREAKER_OPEN` | 503 | CircuitBreakerOpenError | 通道熔断打开（带 channelKey） |

### 2.5 幂等（资金写操作 fail-closed）

| code | HTTP | 类 | 语义 |
|---|---|---|---|
| `IDEMPOTENCY_CONFLICT` | 409 | IdempotencyConflictError | 同一 Idempotency-Key 重复请求 |
| `IDEMPOTENCY_UNAVAILABLE` | 503 | IdempotencyUnavailableError | 幂等基础设施（Redis）不可用，禁止静默绕过 |

---

## 三、功能点状态

| 编号 | 功能点 | 状态 | 说明 |
|---|---|---|---|
| 14.1 | 统一错误响应格式 / AppError 基类 | ✅ | `lib/errors.ts` 编码规范级，全后端统一抛出 |
| 14.2 | 错误码枚举（含预算熔断、幂等、兼容表面） | ✅ | 上表 14 个 code 全部在代码中 |
| 14.3 | 前端 HTTP 拦截器统一处理 | 🟡 | web-console 有统一封装层，但未逐页核验各错误码分支落地 |
| 14.4 | 错误码 → 用户引导文案 | ✅ | message 内建引导（充值/调整预算/稍后重试） |
| 14.5 | 对外 API 错误码文档（Portal /docs） | 🟡 | 错误码已在代码层，但公开开发者文档页的错误码表依赖 Portal /docs 建设（见 §6.4） |

---

## 四、关键约定

- **402 vs 429 的语义区分**：余额不足是 `402`（PAYMENT_REQUIRED/INSUFFICIENT_BALANCE/PRE_CONSUME_FAILED）；预算超限与限流是 `429`（BUDGET_LIMIT_EXCEEDED/RATE_LIMIT_EXCEEDED）——前者请充值，后者请调整限额/稍后再试。
- **预扣 vs 事后扣费**：`PRE_CONSUME_FAILED` 发生在转发上游前，不产生消费记录、无需退款；`INSUFFICIENT_BALANCE` 用于事后扣费。
- **资金写操作 fail-closed**：幂等服务不可用抛 `IDEMPOTENCY_UNAVAILABLE`(503)，绝不静默放行（ADR-0009）。
