# API：用户充值

- 文档 ID：API-BILLING-USER-RECHARGE
- 状态：approved
- 生效版本：v1.0.0
- 对应 PRD：`../../02-requirements/03-billing-and-finance/recharge.md`
- 对应 SPEC：`../../03-functional-spec/03-billing-and-finance/recharge.md`
- 上游 ADR：ADR-0001、ADR-0002、ADR-0003、ADR-0004、ADR-0008、ADR-0009、ADR-0010、ADR-0011、ADR-0023
- 事实来源：`api/src/routes/recharge.ts`、`web-console/src/pages/RechargePage.tsx`；业务规则与上游 accepted ADR 及对应 PRD/SPEC 对齐。

## 0. 规范与路径约定

- **路径约定（ADR-0023）**：平台业务 API canonical 根为 `/api/v1/*`；`/api/v1/v1/*` 为 deprecated alias（兼容至 `v1.x`，`v2.0.0` 移除），新集成不得使用。用户自助充值当前 canonical 创建路径为 `/api/v1/me/recharge`，与当前 API 路由和控制台实现一致；ADR-0009 中的 `/api/v1/recharge` 记录作为历史路径引用，不作为当前端点定义。OpenAI `/v1/*`、Anthropic `/anthropic/v1/*` 属外部兼容协议，与充值业务无关。
- **响应封装（ADR-0011）**：成功 `{ code: 0, message: "ok", data, request_id }`；列表 `{ items, page, page_size, total }`；错误 `{ code, message, details, request_id }`（HTTP 状态 + 业务 `code`）。`request_id` 写入日志、审计与响应。
- **金额精度（ADR-0002）**：请求 `amount` 元、最多 2 位小数；响应 `amount` 为字符串元（保留 2 位/8 位按字段）；禁止 JS `Number` 作最终计算依据。
- **幂等（ADR-0009）**：**创建类资金操作强制 `Idempotency-Key`**（`POST /api/v1/recharge`、`POST /api/v1/admin/manual-topup`、`POST /api/v1/admin/adjust`）。Key 绑定操作者、方法、canonical 路径、请求摘要；相同 Key/摘要回放首次结果（`X-Idempotent-Replay:true`），不同摘要返回 `409 IDEMPOTENCY_CONFLICT`；Redis 不可用 → `503 IDEMPOTENCY_UNAVAILABLE`。Key 建议前端 `crypto.randomUUID()` 生成，服务端 `requestId` 兜底。
- **操作级 2FA（ADR-0008）**：资金写端点须携带一次性操作 token；缺失/未启用 → `403 OPERATION_2FA_REQUIRED`。

## 一、用户自助充值端点（user scope）

> 以下路径取自用户端充值中心参考文档（`ref-2.2.6 §三`、`SPEC-充值中心 §三`）。canonical 路径统一性（`/api/v1/me/*` vs `/api/v1/*`）见 §10 P-1 `【待人工裁决】`。

### 1. `POST /api/v1/me/recharge` — 发起充值

- **鉴权**：登录用户（role >= user）；创建类操作强制 `Idempotency-Key`（ADR-0009）。
- **请求体**：

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| `amount` | number | ✅ | `¥1 ≤ amount ≤ ¥1,000,000`（ADR-0001）；≤2 位小数（ADR-0002） |
| `payment_method` | enum | ✅ | `alipay / wechat / bank_transfer`（不含 `manual`） |
| `promotion_id` | number | 否 | 可选活动 ID |

```json
{ "amount": 100.00, "payment_method": "alipay", "promotion_id": 1 }
```

- **响应 201**（`data`）：

```json
{
  "order_id": "recharge_20260801_xxxxx",
  "status": "pending",
  "amount": "100.00",
  "pay_amount": "100.00",
  "promotion": { "free_amount": "20.00" },
  "qr_code_url": "https://pay.example.com/qr/xxx",
  "expires_at": "2026-08-01T07:30:00+08:00",
  "bank_info": null
}
```

- 对公转账（`bank_transfer`）返回 `bank_info`（户名/账号/开户行）+ `status` 进入 `pending_confirm`/待审核。
- **错误码**：400 `VALIDATION_ERROR`（金额非法/上限/精度、method 非法）、401 `UNAUTHORIZED`、403 `PERMISSION_DENIED`（非用户）、409 `IDEMPOTENCY_CONFLICT`、503 `IDEMPOTENCY_UNAVAILABLE`。

### 2. `GET /api/v1/me/recharge-orders` — 充值记录列表（分页）

- **鉴权**：登录用户。
- **响应**：`{ items: [{ order_id, amount, payment_method, paid_at, status, can_retry }], page, page_size, total }`；状态仅业务状态（ADR-0021 用户端不暴露审批阶段）。

### 3. `GET /api/v1/me/recharge-orders/:id` — 订单详情

- **鉴权**：归属用户本人。
- **响应**：含订单号、金额、方式、状态、优惠、回调信息等；用于支付状态轮询。

### 4. `POST /api/v1/me/recharge-orders/:id/retry`（同 `/recharge-orders/:id/pay`）— 重新支付（过期订单）

- **鉴权**：用户本人；仅限 `expired` 且 30 分钟内。
- **响应 201**：新二维码/支付信息。

### 5. `POST /api/v1/me/recharge-orders/bank-transfer` — 上传对公转账凭证

- **鉴权**：登录用户。
- **请求体**：`order_id`、凭证文件（JPG/PNG/PDF ≤5MB）、备注。
- **响应 201**：凭证已提交，进入 `pending_confirm` 待审核。

### 6. `GET /api/v1/me/balance` — 查询余额

- **鉴权**：登录用户。
- **响应**：`{ balance: "0.00", ... }`；无余额行用户返回 `¥0.00`（兜底语义，不 404）。

### 7. `GET /api/v1/me/transactions` — 消费明细列表

- **鉴权**：登录用户。
- **响应**：`{ items: [{ timestamp, type, amount, balance_before, balance_after, description, order_id }], page, page_size, total }`；含 `recharge / consumption / refund / adjustment / promotion` 类型。

### 8. `GET /api/v1/me/promotions` — 可用优惠列表

- **鉴权**：登录用户。

### 9. `POST /api/v1/me/recharge/callback` — 支付回调（外部渠道）

- **鉴权**：渠道签名验证（非 token）。
- **请求体**：`order_id / trade_no / pay_amount / status / signature`。
- **处理**：验证签名 → 幂等（`payment_order_no` 唯一）→ 金额核对 → 更新订单 → 增加余额 → 写流水 → 通知；金额不一致保持待验证 + P0 告警，不增加余额。
- **响应**：成功 `200`（重复回调幂等返回 `200 duplicate notification`）；签名失败 `400`；订单不存在 `404`。

## 二、管理端人工上账端点（admin scope，canonical `/api/v1/*`）

> 来源 `ARCH-整改R1-R4 §3.2/§5.4` + §12.4 D1。所有管理端资金端点鉴权由 `requirePerm(permKey)` 守卫（JWT 登录 + 权限点，替代角色白名单）。

### 10. `POST /api/v1/admin/manual-topup` — 发起人工上账

- **鉴权**：`finance.topup`（finance/admin/super_admin）；创建类强制 `Idempotency-Key`。
- **请求头**：`Authorization: Bearer <jwt>`；`Idempotency-Key`（推荐）。
- **请求体**：

| 字段 | 类型 | 必填 | 校验 | 落库 |
|---|---|---|---|---|
| `user_id` | number | ✅ | 正整数；存在（404）；`active`（frozen → 400 `VALIDATION_ERROR`） | `recharge_orders.user_id` |
| `amount` | number | ✅ | `>0` 且 `≤ ¥50,000`（ADR-0001）；≤2 位小数 | `recharge_orders.amount`（`toFixed(2)`） |
| `note` | string | ✅ | 非空 ≤500 | `recharge_orders.note` |
| `transfer_no` | string | 否 | ≤100；填写则平台唯一 | `recharge_orders.metadata.transfer_no` |
| `evidence_remark` | string | 否 | ≤500 | `recharge_orders.metadata.evidence_remark` |
| `evidence_url` | — | — | 本期不接受，传入即 400 | — |

```json
{
  "user_id": 42,
  "amount": 1000.00,
  "note": "线下对公转账已到账，凭凭证入账",
  "transfer_no": "BANK-20260818-0001",
  "evidence_remark": "对公回单已核验，金额一致"
}
```

- **响应 201**：`{ data: { id, order_no, user_id, amount, method:'manual', status:'pending', status_label:'待审核', created_at }, message:"上账申请已创建，待审核" }`（`order_no` 以 `MT` 前缀；`metadata{source:'admin-manual-topup', created_by}`）。
- **错误码**：400 `VALIDATION_ERROR`（amount≤0/超限、user_id 非法、note 缺失、frozen、传 evidence_url）；401 `UNAUTHORIZED`；403 `FORBIDDEN`（无 `finance.topup`）/ `OPERATION_2FA_REQUIRED`；404 `NOT_FOUND`（用户不存在）；409 `IDEMPOTENCY_CONFLICT` / `DUPLICATE_BUSINESS_REFERENCE`（同 `transfer_no` 重复）；503 `IDEMPOTENCY_UNAVAILABLE`；500 `ORDER_CREATE_FAILED`。
- **审计**：`manual_topup.create`，details 含 `{userId, amount, order_no, created_by}`。

### 11. `GET /api/v1/admin/manual-topup` — 人工上账列表

- **鉴权**：`finance.topup`。
- **响应**：`{ items, page, page_size, total }`；每项含用户/金额/类型/原因/`status`(业务)/`approval_phase`；`pending` 行含审核操作位。列表契约含占位字段 `evidence_url`（`null`）。

### 12. `POST /api/v1/admin/manual-topup/:id/review` — 审核（通过/驳回）

- **鉴权**：`finance.topup`；资金写操作按 ADR-0008 操作级 2FA（如启用）；幂等。
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `action` | enum | ✅ | `approve` / `reject` |
| `review_note` | string | reject 必填 | 驳回原因 ≤500 |
| `approval_phase` | enum | approve 时可选 | `level1/level2/super` 提交当前审批 | 

- **响应**：`{ data: { id, status, balance_after }, message }`；`status='paid'`（approve）或 `'rejected'`（reject）。
- **入账**：approve 分支走 `creditBalance`（自动建户兜底 + 加额 + 流水），事务提交后触发 `recharge_success` 通知并写审计（含 `balance_after`、notification 状态）。
- **错误码**：400 `VALIDATION_ERROR`；403 `FORBIDDEN`/`OPERATION_2FA_REQUIRED`；404 `NOT_FOUND`；409 `ORDER_ALREADY_PROCESSED`（重复审核）、`IDEMPOTENCY_CONFLICT`；503 `IDEMPOTENCY_UNAVAILABLE`。

### 13. `GET /api/v1/admin/manual-topup/users?search=&page_size=10` — 轻量用户搜索（ARCH §12.4 D1）

- **鉴权**：`finance.topup`。
- **搜索维度**：邮箱（精确/模糊）、用户 ID（精确）、手机号（精确，仅已绑定用户）。
- **响应**：`{ items: [{ id, email, name, status, available_balance }] }`，最多 10 条；不放开 `GET /admin/customers`（防越权看全量客户）。

### 14. `POST /api/v1/admin/recharge-orders/:id/audit` — 充值订单审核通过

- **鉴权**：`finance.topup`（ARCH §12.1 Q2 裁决放行 finance）；幂等。
- **处理**：approve 分支走 `creditBalance` + 入账 + `recharge_success` 通知 + 审计；重复/非 `pending` → 409 `ORDER_ALREADY_PROCESSED`。

### 15. `POST /api/v1/admin/recharge-orders/:id/reject` — 充值订单驳回

- **鉴权**：`finance.topup`；驳回原因必填；幂等。

## 三、错误码总表（充值主题）

| HTTP | `code` | 场景 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 参数/金额/精度/用户状态校验失败 |
| 401 | `UNAUTHORIZED` | 未登录 / token 缺失或失效 |
| 403 | `PERMISSION_DENIED` | 无权限点（越权） |
| 403 | `OPERATION_2FA_REQUIRED` | 缺少/未启用操作级 2FA |
| 404 | `NOT_FOUND` | 用户/订单不存在 |
| 409 | `IDEMPOTENCY_CONFLICT` | 幂等 Key 不同摘要/重复提交中 |
| 409 | `ORDER_ALREADY_PROCESSED` | 已处理/重复审核 |
| 409 | `DUPLICATE_BUSINESS_REFERENCE` | 重复业务凭证（如同 `transfer_no`） |
| 503 | `IDEMPOTENCY_UNAVAILABLE` | 幂等依赖 Redis 不可用 |
| 500 | 内部错误 | 插入失败等非预期 |

> 响应格式统一遵循 ADR-0011：错误体 `{ code, message, details, request_id }`，不返回业务 `data`。

## 四、兼容窗口

- 管理端人工上账三端点鉴权由 `adminAuth` 切换 `requirePerm('finance.topup')`；admin/super_admin 行为不变，finance 新增可访问（ARCH §5.4/§9.1）。
- `GET /admin/manual-topup` 与 `POST /admin/manual-topup/:id/review` 列表/审核响应契约本期不变（ARCH §9.1）。
- 用户端充值链路不受影响（`ALLOWED_METHODS` 不含 `manual`）。
- deprecated alias `/api/v1/v1/*` 不得用于新集成（ADR-0023）。

## 五、测试映射（真实用例）

复用 ARCH §8（`admin-manual-topup.test.ts`、`balance.test.ts`、`require-perm.test.ts`，`pnpm test` 真实 PG+Redis）：
1. 创建上账成功 / 参数校验 / 幂等（ARCH 用例 1/2/3）；
2. 审核通过兜底 / 正常 / 防重复（用例 4/5）；
3. 通知触发（用例 6）；
4. 越权权限点（用例 7）；
5. `creditBalance` 兜底/正常/并发（用例 8/9/10）；
6. `requirePerm` 权限矩阵（用例 13）。

## 六、已登记实现差距（不改变 canonical 契约）

| # | 事项 | 说明 |
|---|---|---|
| P-2 | 操作级 2FA 实现证据 | ADR-0008 已冻结为强制；操作摘要绑定、一次性消费/防重放与 fail-closed 仍需实现和可复核 TEST/OPS 证据。 |
| P-3 | 分级审批端点阶段表达 | 审核请求的 `approval_phase` 与现有 `review` 契约的编排仍需实现和测试证据。 |