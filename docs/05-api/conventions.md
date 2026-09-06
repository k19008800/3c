# API 统一约定

- 文档 ID：API-CORE-001
- 状态：approved
- 生效版本：v1.0.0
- 上游 ADR：ADR-0005（API 版本）、ADR-0011（响应/错误结构）、ADR-0023（alias 兼容窗口）、ADR-0008（操作级 2FA）、ADR-0009（资金幂等）、ADR-0024（权限拒绝）、ADR-0030（四项业务契约冻结）
- 关联：`errors.md`（错误码字典）、`idempotency.md`（资金幂等规范）
- 事实来源：`docs/05-api/user/recharge.md`、`docs/05-api/admin/finance.md`、`api/src/lib/errors.ts`、`api/src/routes/*.ts`

## 1. 两个 API 表面（surface）

3cloud 网关对外提供两类 API 表面，二者签名与响应结构不同，接入方须区分使用：

| 表面 | 前缀 | 用途 | 成功响应 | 错误响应 | 认证 |
|---|---|---|---|---|---|
| **平台业务 API** | `/api/v1/*` | Portal/Console/Admin 自有业务（充值、人工上账、调账、退款/红冲、结算/对账等） | `{code:0, message:"ok", data, request_id}`（ADR-0011） | `{code, message, details, request_id}`（ADR-0011） | Bearer token / 会话；资金写操作叠加操作级 2FA |
| **兼容 API** | `/v1/*`（OpenAI 兼容）、`/anthropic/v1/*`（Anthropic 兼容） | 模型推理网关（chat/completions、messages、responses） | OpenAI/Anthropic 原生响应结构 | `{ error: { message, type, code } }` | `Authorization: Bearer <api_key>` |

> **别名兼容窗口（ADR-0023）**：`/api/v1/v1/*` 为 deprecated 平台业务 alias，兼容至 `v1.x`，在 `v2.0.0` 移除；不再支持错误的单层 `/api/v1/*` 历史路径作为 alias。本文档以下「平台业务 API」统称 `/api/v1/*`。

> **ADR-0030 最终口径**：兼容 API 模型消费余额不足使用 HTTP `402`/`PAYMENT_REQUIRED`；平台业务资金操作禁负校验使用 HTTP `422`/`INSUFFICIENT_BALANCE`。分页正式字段为 `page`、`page_size`，响应为 `data.items/page/page_size/total`；`pageSize` 仅作 v1.x 兼容别名。

## 2. 路径规范

- `/api/v1/*`：平台业务 API canonical（本文档主体）。
- `/v1/*`：OpenAI 兼容 API canonical（模型推理）。
- `/anthropic/v1/*`：Anthropic 兼容 API canonical（模型推理）。
- `/api/v1/v1/*`：deprecated alias（ADR-0023），新集成不使用。
- 资源路径小写、复数名词；子路径用「动词短语」表示操作（如 `/admin/refunds/:id/execute`）。
- 资金写操作仅暴露在 `/api/v1/*` 管理端/用户端路径，不在兼容 API 表面暴露。

## 3. 响应结构（ADR-0011）

### 3.1 成功响应
```json
{ "code": 0, "message": "ok", "data": { ... }, "request_id": "req_..." }
```
- `code=0` 表示成功；非 0 用业务错误码（见 `errors.md`）。
- 列表统一：`data: { items: [...], page, page_size, total }`。
- `request_id`：全链路唯一，贯穿日志/审计/错误响应，用于排障与幂等回溯。

### 3.2 错误响应
```json
{ "code": "VALIDATION_ERROR", "message": "...", "details": { ... }, "request_id": "req_..." }
```
- 错误响应不返回业务 `data`。
- `code` 为业务错误码（见 `errors.md`），`message` 为对人可读信息（可含插值金额），`details` 为可选结构化上下文（如当前/所需余额）。
- HTTP 状态码与业务 `code` 语义对应关系见 `errors.md` 字典表。

### 3.3 金额序列化（ADR-0002）
- 输入可接受最多 2 位小数字符串；内部/返回统一数值精度：余额与 Token 消费 `numeric(18,8)`、代理佣金 `numeric(18,4)`、展品与输入价 `numeric(18,8)`。
- JSON 传输金额使用**字符串**（保留精度，避免 JS `Number` 精度丢失），展示层再格式化为 2 位小数。
- 禁止以 JavaScript `Number` 作为金融最终计算依据。

## 4. 认证与权限

- 平台业务 API 认证：`Authorization: Bearer <token>` 或会话 Cookie（见各模块）。所有资金写操作**后端**按权限点鉴权，角色只作聚合（ADR-0004）。
- 无权限统一返回 HTTP `403 PERMISSION_DENIED`（ADR-0004/0024）。
- 资金写操作强制**操作级 2FA**（ADR-0008），缺少/未启用返回 `403 OPERATION_2FA_REQUIRED`；`super_admin` 不默认豁免。
- 统一权限计算优先级（ADR-0024）：显式 `deny` > 管理员强制策略 > 显式 `grant` > 角色权限并集 > 默认最小权限。

## 5. 幂等（ADR-0009，详见 idempotency.md）

- 创建类资金操作（充值、人工上账、调账）与审批、退款、红冲、结算确认等资金写操作强制 `Idempotency-Key` 头。
- 相同 Key+摘要回放首次结果；摘要不同返回 `409 IDEMPOTENCY_CONFLICT`；幂等基础设施不可用返回 `503 IDEMPOTENCY_UNAVAILABLE`。
- DB 唯一约束、事务与状态条件更新为最终边界，Redis 仅作加速锁。

## 6. 追踪与审计

- 所有请求生成 `request_id`，进入日志、审计（`audit_logs`）与错误响应。
- 资金写操作写审计（操作者、审批人、时间、结果、`balance_after`、幂等键）；审计与通知事务分离（ADR-0010）。

## 7. 分页

- 列表请求支持 `page`（从 1 起）与 `page_size`；响应 `data.page/page_size/total` + `data.items`。
- 对账/结算导出使用一致性快照语义读取（REFERENCE REPORT `REPEATABLE READ`/`SERIALIZABLE`），不受导出期间新交易影响。
