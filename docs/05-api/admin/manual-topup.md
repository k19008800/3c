# API：管理端人工上账（manual-topup）

- 文档 ID：API-BILLING-MANUAL-TOPUP
- 状态：approved
- 生效版本：v1.0.0
- 上游 ADR：ADR-0001、ADR-0002、ADR-0003、ADR-0004、ADR-0008、ADR-0009、ADR-0010、ADR-0011、ADR-0013、ADR-0021、ADR-0022
- 对应 SPEC：`../../../03-functional-spec/03-billing-and-finance/manual-topup.md`
- 对应状态机：`../../../06-data-and-architecture/state-machines/manual-topup.md`
- 关联文档：`docs/02-requirements/03-billing-and-finance/manual-topup.md`（PRD）、`docs/ARCH-整改R1-R4-技术方案.md`（§3.2/§3.3/§5/§6）、`docs/00-index/open-issues.md`（项 13 已解决）

> **本文件为人工上账（manual-topup）管理端 API 的专属契约**。为避免多 topic 并行写同一 `05-api/admin/finance.md` 造成覆盖丢失，本契约独立成文，后续由协调方统一合并进 `docs/05-api/admin/finance.md` 并在 `00-index` 登记。
>
> **核心口径**：人工上账语义 = 线下/对公已到账入账；单笔上限固定 **¥50,000**（超过即拒绝，**不进入终审档**；大额对公走充值订单，ADR-0001 + open-issues 项 13 已解决）；用户自助充值单笔上限 ¥1,000,000 为独立业务对象，与此不混同。

## 契约状态

人工上账的创建/审批均为资金写端点，须同时满足：权限点 `finance.topup`、操作级 2FA、幂等（Idempotency-Key）、状态条件更新。响应遵循 ADR-0011（成功 `{ code:0, message:"ok", data, request_id }`；列表 `items/page/page_size/total`；错误 `{ code, message, details, request_id }`）。

> 下表端点基于 `docs/ARCH-整改R1-R4-技术方案.md`（R1 创建、R3 鉴权、R4 通知）结合 accepted ADR 成文；凡来源未明确处标注 `【待人工裁决】`，未核验端点不得标记 `implemented`。

## 统一约束

1. **权限**：全部端点需 `finance.topup`（`requirePerm('finance.topup')`，finance / admin / super_admin 可访问）；无权限 `403 PERMISSION_DENIED`（ADR-0004/0011）。前端只控制入口显隐，不替代后端校验。
2. **职责分离**：创建人≠审批人、一级≠二级审批人、终审不重复前级（ADR-0004）。
3. **操作级 2FA**：创建、审批（通过/驳回）均为资金写端点，强制后端操作级 2FA，`super_admin` 不豁免；前端二次确认不能替代后端校验（ADR-0008）。
4. **幂等**：创建端点强制 `Idempotency-Key`；审批/驳回为状态条件更新（ADR-0009）。Redis 不可用返回 `503 IDEMPOTENCY_UNAVAILABLE`，不静默绕过。
5. **金额精度**：输入 ≤2 位小数（元/分），内部余额/流水 `numeric(18,8)`；禁止 JavaScript `Number` 作最终计算（ADR-0002）。
6. **单笔上限**：`≤ ¥50,000`（默认常量 `MANUAL_TOPUP_MAX_AMOUNT=50000.00`，可经 `system_config finance_rules` 覆盖，读失败回退常量）；超限拒绝创建（ADR-0001）。
7. **24h 滚动限额**：创建前校验操作人（`limits.operator_24h`）与被入账用户（`limits.recipient_24h`），默认均 `50000.00`；任一超限按 `limits.exceed_action`（`escalate` 升级至少双人 / `reject` 拒绝）处置；`super_admin` 不豁免（ADR-0013/0022）。优先级：`invalid input → hard business limit → 24h limit → approval threshold → normal processing`。
8. **状态/审批阶段**（ADR-0021）：响应同时返回 `status`（`pending/paid/rejected/failed`）、`approval_phase`（`none/level1/level2/super/completed`）、`approval_required`；用户端只暴露业务状态。不得以 `pending_level2`/`pending_super` 作为业务 `status`。

---

## 1. 发起人工上账（创建）

`POST /api/v1/admin/manual-topup`

**请求头**

| Header | 必填 | 说明 |
|--------|:---:|------|
| `Authorization: Bearer <jwt>` | ✅ | 需 `finance.topup`（finance / admin / super_admin） |
| `Idempotency-Key` | ✅ | UUID 或业务单号，≤100；按 ADR-0009 幂等 |
| `X-Operation-2FA` | ✅ | 操作级 2FA 一次性码（ADR-0008） |

**请求体**（snake_case）：

```json
{
  "user_id": 42,
  "amount": 1000.00,
  "note": "线下对公转账已到账，凭凭证入账",
  "transfer_no": "BANK-20260818-0001",
  "evidence_remark": "对公回单已核验，金额一致"
}
```

**字段表**

| 字段 | 类型 | 必填 | 校验 | 落库 |
|------|------|:---:|------|------|
| `user_id` | integer | ✅ | 正整数；用户存在（不存在 `404 NOT_FOUND`）；状态 `active`（`frozen` → `400 VALIDATION_ERROR`，提示先解锁） | `recharge_orders.user_id` |
| `amount` | number | ✅ | `> 0` 且 `≤ MANUAL_TOPUP_MAX_AMOUNT`（默认 ¥50,000）；最多 2 位小数 | `recharge_orders.amount`（`numeric(18,2)`） |
| `note` | string | ✅ | 非空（trim 后）、≤500 字 | `recharge_orders.note` |
| `transfer_no` | string | 可选 | ≤100；填写则全平台唯一（重复 `409 DUPLICATE_BUSINESS_REFERENCE`） | `recharge_orders.metadata.transfer_no` |
| `evidence_remark` | string | 可选 | ≤500 | `recharge_orders.metadata.evidence_remark` |
| `evidence_url` | — | — | 本版本不接受（凭证上传属 R9）；传入即 `400 VALIDATION_ERROR`（防前端误以为已支持上传） | — |
| `topup_type` | enum | 可选 | `bank_transfer` / `grant`，仅驱动表单提示，不强制落库（`【待人工裁决】` 是否落库） | — |

**响应 `201`**

```json
{
  "code": 0, "message": "ok",
  "data": {
    "id": 123, "order_no": "MT202608181530121234",
    "user_id": 42, "amount": 1000, "method": "manual",
    "status": "pending", "status_label": "待审核",
    "approval_phase": "none", "approval_required": true,
    "created_at": "2026-08-18T07:30:12.000Z"
  },
  "request_id": "req_..."
}
```

- 订单号：`MT` + `yyyyMMddHHmmss` + 4 位随机（`genManualOrderNo`），避免与用户端 `RC` 前缀混淆。
- 落库：`recharge_orders`（`method='manual'`、`status='pending'`），`metadata={ source:'admin-manual-topup', created_by:<operatorId>, transfer_no?, evidence_remark? }`。
- 审计：`action='manual_topup.create'`、`resource='recharge_order'`、`resourceId=String(order.id)`、`details={ userId, amount, order_no, created_by }`。

**错误码**

| HTTP | code | 场景 |
|:---:|------|------|
| 400 | `VALIDATION_ERROR` | amount ≤0 / 超上限 / user_id 非法 / note 缺失 / 传入 `evidence_url` / 用户状态 frozen |
| 401 | `UNAUTHORIZED` | 未登录 / Token 缺失或失效 |
| 403 | `PERMISSION_DENIED` | 无 `finance.topup` |
| 403 | `OPERATION_2FA_REQUIRED` | 缺/未启用操作 2FA；错误/过期/重放使用 2FA 固定错误码 |
| 404 | `NOT_FOUND` | 用户不存在 |
| 409 | `IDEMPOTENCY_CONFLICT` | 同 Idempotency-Key 异摘要重放 |
| 409 | `DUPLICATE_BUSINESS_REFERENCE` | 同 `transfer_no` 重复创建 |
| 409/429 | 24h 限额处置 | `exceed_action=reject` 时拒绝（`【待人工裁决】` 固定错误码取值） |
| 503 | `IDEMPOTENCY_UNAVAILABLE` | Redis 幂等不可用 |
| 500 | `ORDER_CREATE_FAILED` | 插入失败（唯一键冲突等非预期） |

---

## 2. 人工上账列表

`GET /api/v1/admin/manual-topup`

**Query**：`page`、`page_size`、`status`、`transfer_no`、`start_date`、`end_date`、`user_id`
**鉴权**：`finance.topup`

**响应**

```json
{
  "code": 0, "message": "ok",
  "data": {
    "items": [{
      "id": 123, "order_no": "MT202608181530121234", "user_id": 42,
      "amount": 1000, "method": "manual",
      "status": "pending", "status_label": "待审核",
      "approval_phase": "none", "approval_required": true,
      "note": "线下对公转账已到账", "transfer_no": "BANK-20260818-0001",
      "evidence_remark": "对公回单已核验", "evidence_url": null,
      "created_at": "2026-08-18T07:30:12.000Z", "paid_at": null, "reviewer_id": null
    }],
    "page": 1, "page_size": 20, "total": 1
  },
  "request_id": "req_..."
}
```

- 每项含 `status + approval_phase + approval_required`（ADR-0021）；`transfer_no`/`evidence_remark` 读自 `metadata`。
- 凭证上传未落地前 `evidence_url` 恒为 `null`（占位）。前端映射：`paid→已到账`、`failed→已驳回` 保持一致（`admin-finance-missing.ts` 既有映射不变）。

---

## 3. 审批（通过 / 驳回）

`POST /api/v1/admin/manual-topup/:id/review`

**请求头**：`Authorization` + `X-Operation-2FA`（必填）

**请求体**

```json
{ "action": "approve", "review_note": null }
```

**字段表**

| 字段 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `action` | enum | ✅ | `approve`（通过） / `reject`（驳回） |
| `review_note` | string | `reject` 时必填 | 驳回原因 ≤500 字（`reject` 必须填写） |

**审批分级（ADR-0001/0004/0021）**：服务端按金额阈值计算当前阶段并强制执行职责分离——

| 单笔金额 | 阶段流转 | `approve` 行为 |
|---------|---------|---------------|
| ≤ ¥10,000 | `none → completed` | 一级通过即入账（`pending → paid`） |
| > ¥10,000 且 ≤ ¥50,000 | `none → level1 → level2 → completed` | 一审推进阶段（`status` 保持 `pending`），二审通过才入账 |
| 任一待审批阶段 | — | `reject` → `rejected` |
| > ¥50,000 | — | 无法创建生成，不进终审档 |

- 职责分离（ADR-0004）：创建人≠审批人、一级≠二级，违规返回 `403`/`409`。

**通过并入账语义**（事务内，收口自 R2 `creditBalance`）：

1. 状态条件更新 `recharge_orders` `pending→paid`（`where status='pending'` 守卫，防并发重复审核）；
2. `INSERT INTO customer_balances ... ON CONFLICT (user_id) DO NOTHING`（无余额行自动建户兜底）；
3. `UPDATE customer_balances SET available_balance += amount, total_balance += amount, version += 1`（RETURNING balanceAfter）；
4. `INSERT INTO balance_transactions(type='recharge', balance_after, reference_type='recharge_order', reference_id)`；
5. `approval_phase=completed`、记录 `reviewer_id`、写审计。

- 事务提交后（不阻塞主响应）：Redis 账本可用增量同步 → 清除负余额标记（>=0 时）→ `notifyUser('recharge_success')`（站内信必发 + 按偏好邮件，ADR-0010）。
- 事务失败整体回滚，订单保持 `pending`，无部分入账、无重复通知。

**响应 `200`**

```json
{ "code": 0, "message": "ok", "data": { "id": 123, "status": "paid", "status_label": "已到账", "approval_phase": "completed", "approval_required": false, "balance_after": "11250.00" }, "request_id": "req_..." }
```

**错误码**：`400 VALIDATION_ERROR`（action 非法 / review_note 缺失）、`401 UNAUTHORIZED`、`403 PERMISSION_DENIED`、`403 OPERATION_2FA_REQUIRED`、`403/409`（职责分离违规）、`404 NOT_FOUND`（单据不存在）、`409 ORDER_ALREADY_PROCESSED`（重复/并发审批）、`500 BALANCE_CREDIT_FAILED`（入账异常，理论不可达）。

---

## 4. 用户搜索（选择用户）

`GET /api/v1/admin/manual-topup/users`

**Query**：`search`（邮箱 精确/模糊、用户 ID 精确、手机号 精确，仅对已绑定手机号用户）、`page_size`（默认 10，≤10 条）
**鉴权**：`finance.topup`（专用轻量端点，不放开 `GET /admin/customers`，避免 agent/sales 越权看全量客户列表）

**响应**

```json
{ "code": 0, "message": "ok", "data": { "items": [{ "id": 42, "email": "u@example.com", "name": "张三", "status": "active", "available_balance": "10250.00" }] }, "request_id": "req_..." }
```

- 仅返回 `active` 用户可入账（`frozen` 由创建校验拦截）；前端回显「邮箱 · 名称 · 用户ID · 当前余额 · 状态」。
- 越权：未登录 `401`；无 `finance.topup` → `403 PERMISSION_DENIED`。

---

## 5. 作废（`【待人工裁决】`）

`POST /api/v1/admin/manual-topup/:id/void`

- 人工上账「创建后取消/作废」的语义未在 ADR 中明确（PRD 口径当前为「创建后不提供取消，需撤回走驳回」）。**作废端点是否纳入 v1.0.0、对已 `pending` 与已入账单据的处理、与审计/幂等关系待人工裁决；确认前不标记 `implemented`。**

---

## 6. 错误码汇总（ADR-0011/0008/0009/0001）

| 场景 | HTTP | code |
|------|------|------|
| 无 `finance.topup` 权限 | 403 | `PERMISSION_DENIED` |
| 缺/未启用操作 2FA | 403 | `OPERATION_2FA_REQUIRED` |
| 2FA 错误/过期/重放 | 403 | 2FA 固定错误码 |
| 同 Key 异摘要重放 | 409 | `IDEMPOTENCY_CONFLICT` |
| 重复转账单号 | 409 | `DUPLICATE_BUSINESS_REFERENCE` |
| 单据已处理（重复/并发审批） | 409 | `ORDER_ALREADY_PROCESSED` |
| Redis 幂等不可用 | 503 | `IDEMPOTENCY_UNAVAILABLE` |
| 单笔超上限 / 参数非法 | 400 | `VALIDATION_ERROR` |
| 用户不存在 | 404 | `NOT_FOUND` |
| 24h 累计超限且 `exceed_action=reject` | 409/429 | `【待人工裁决】` 固定错误码取值 |
| 入账异常 | 500 | `BALANCE_CREDIT_FAILED` |
| 创建插入失败 | 500 | `ORDER_CREATE_FAILED` |

---

## 7. 未决事项（`【待人工裁决】` 清单）

1. `topup_type`（bank_transfer/grant）是否作为后端落库字段（当前仅驱动表单提示，不强制落库）。
2. 凭证文件正式上传（`evidence_url` 落库）能力挂载（R9）；本期 `transfer_no`/`evidence_remark` 写入 `metadata`。
3. §5 作废端点的语义与是否纳入 v1.0.0。
4. 24h 累计超限 `exceed_action=reject` 的固定错误码取值（409/429）。
5. `approval_required`（当前操作者是否仍需审批）的服务端判定细节（依赖当前操作者已审批阶段）。

---

## 8. 测试映射（对应 SPEC §9 与状态机「测试映射」）

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | 创建成功 201 | `method='manual'`、`status='pending'`、`order_no` 以 `MT` 开头、`metadata.transfer_no` 正确；审计 `manual_topup.create` |
| 2 | 创建参数校验 | amount=0/负/超上限 → `VALIDATION_ERROR`；`evidence_url` 传入 → 400；user_id 不存在 → 404；frozen 用户 → 400 |
| 3 | 幂等/唯一 | 同 Key 重放回放首次 / 不同摘要 `IDEMPOTENCY_CONFLICT`；同 `transfer_no` `DUPLICATE_BUSINESS_REFERENCE`；幂等键列仅 1 行 |
| 4 | 越权 | finance 创建/审批 200；sales/customer 403 `PERMISSION_DENIED`；未登录 401 |
| 5 | 无余额行兜底 | 无 `customer_balances` 行 → approve → 自动建户 + 余额=amount + 流水；不再 `BALANCE_NOT_FOUND`；并发建户单行 |
| 6 | 审批分级 | ≤¥10k 一审即 `paid`；>¥10k≤¥50k 需二审才 `paid`；创建人=审批人 / 一二级重复被拒 |
| 7 | 重复审批 | 同单重复 approve → `409 ORDER_ALREADY_PROCESSED`，余额不重复累加 |
| 8 | 2FA | 缺/未启用 `OPERATION_2FA_REQUIRED`；错误/过期/重放固定错误码 |
| 9 | 通知 | `paid` 后 `notifications` 新增 `recharge_success`；SMTP 未配置 email=`skipped` 不报错 |
| 10 | 24h 限额 | operator/recipient 维度滚动窗口；`exceed_action` 处置 |
| 11 | status/approval_phase | 响应含三字段；用户端仅业务状态；无 `pending_level2` status |