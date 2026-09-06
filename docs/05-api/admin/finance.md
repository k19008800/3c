# API：管理端核心资金

- 文档 ID：API-BILLING-003
- 状态：approved
- 生效版本：v1.0.0
- 上游 ADR：ADR-0001、ADR-0002、ADR-0003、ADR-0004、ADR-0006、ADR-0008、ADR-0009、ADR-0010、ADR-0011、ADR-0012、ADR-0020、ADR-0022

## 覆盖范围
人工上账、充值审核、调账、退款、红冲、结算与对账的管理端接口。本文档由多 topic 分工协作补充：
- **退款/红冲（refund-and-reversal）** 端点见 §A/B/C（对应 topic 补写者完成）。
- **结算与对账（settlement-and-reconciliation）** 端点见 §S（本 topic：对账任务发起 / 差异查看 / 差异处理 / 确认平账，及代理结算周期与结算单端点）。
- **人工上账（manual-topup）** 端点（本 topic）见 §M：创建 / 列表 / 审批（通过·驳回）/ 用户搜索。创建遵循 ADR-0009 资金幂等规范；分级审批与 `status + approval_phase` 字段表达见 ADR-0001/0021。
- **调账（balance-adjustment）** open 端点见 §D（本 topic：发起/审批/查询；对齐 `ARCH-整改R5-R7-资金风控.md` §2.3 与 `SPEC-BILLING-003` §6）。此处分工与初稿冲突：本文档既有范围说明曾将调账列入"以各自分工文档为准"，现按 `PRD-BILLING-003` 统一收纳调账端点于本文档 §D，其他 topic（充值审核）仍以各自分工文档为准。

## 契约状态
资金写端点必须同时满足权限点、操作级 2FA、幂等和状态条件更新；响应遵循 ADR-0011（`{ code:0, message:"ok", data, request_id }`，列表 `items/page/page_size/total`）。

> 已实现状态标注：当前仓库 `refund_requests` 表仅实现 `pending|approved|rejected` 三态（`api/src/db/schema/gap-fix-2026-08.ts`），与 ADR 状态机（`pending→approved→processing→completed`，含 `rejected`/`failed`）存在差距。以下端点中标注 `approved` 版本目标的，落地前需迁移表以补齐 `processing/completed/failed` 状态；未 audit 的端点不得标记 `implemented`。

> **结算/对账端点说明（本 topic）**：§S 端点正文基于 `docs/ref-4.4.5-reconciliation-prd.md`、`docs/SPEC-§29-资金与对账管理.md`、`docs/supplement/02-对账差异处理定量规则.md`、`docs/sprint-1/03-settlement-overview.md` 给出字段与错误码；`platform_ledger` 相关的总账/结转能力按 ADR-0012 本期不启用，涉及该表的端点仅作预留。凡来源未明确处标注 `【待人工裁决】`，未核验端点不得标记 `implemented`。

## 统一约束
1. **2FA**：审核、执行、红冲等资金写端点强制操作级 2FA，`super_admin` 不豁免（ADR-0008）。
2. **幂等**：创建类端点强制 `Idempotency-Key`；审批/执行/红冲纳入统一幂等规范并做状态条件更新（ADR-0009）。
3. **权限**：后端按权限点鉴权，无权限 `403 PERMISSION_DENIED`；创建人≠审批人（ADR-0004）。
4. **禁负余额**：余额扣减不足返回受控业务错误 `INSUFFICIENT_BALANCE`，不写负余额（ADR-0020）。
5. **金额精度**：输入 ≤2 位小数，内部 `numeric(18,8)`（ADR-0002）。
6. **限额与审批定级（调账等资金写操作）**：创建类资金写操作先查 24h 累计限额（`limits.operator_24h`/`limits.recipient_24h`，默认 ¥50,000）再定审批级别；超限按 `exceed_action`（`escalate` 升级至少双人 / `reject` 拒绝）；配置键与优先级冻结见 ADR-0022（`soft_limit`/`hard_limit` 不作为对外键）。

---

## M. 人工上账端端点（本 topic）

> 源头：`docs/ARCH-整改R1-R4-技术方案.md` §3.2/§3.3/§5（R1 创建、R3 鉴权）、§6（R4 通知），结合 ADR-0001（¥50,000 上限与分级阈值）、ADR-0004（权限点/职责分离）、ADR-0008（2FA）、ADR-0009（幂等）、ADR-0021（status/approval_phase）、ADR-0013/0022（24h 滚动限额）。人工上账语义 = 线下/对公已到账入账；单笔上限固定 ¥50,000（超过即拒绝，不进入终审档，ADR-0001 + `open-issues.md` 项 13 已解决）；大额对公走充值订单。
>
> **状态与审批字段**（ADR-0021）：管理端响应同时返回 `status`（`pending/paid/rejected/failed`）、`approval_phase`（`none/level1/level2/super/completed`）、`approval_required`（当前操作者是否仍需审批）；用户端只暴露业务状态。新接口不得以 `pending_level2`/`pending_super` 作为业务 `status`。
>
> **鉴权**：全部人工上账端点需持 `finance.topup` 权限点（`requirePerm('finance.topup')`）；非角色白名单 `adminAuth`，finance 角色可访问。

### M.1 发起人工上账（创建）
`POST /api/v1/admin/manual-topup`

**请求头**
| Header | 必填 | 说明 |
|--------|:---:|------|
| `Authorization: Bearer <jwt>` | ✅ | 需 `finance.topup`（finance / admin / super_admin） |
| `Idempotency-Key` | ✅ | UUID 或业务单号，≤100；按 ADR-0009 幂等（本端点列为强制 Idempotency-Key） |
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

| 字段 | 类型 | 必填 | 校验 | 落库 |
|------|------|:---:|------|------|
| `user_id` | integer | ✅ | 正整数；用户存在（不存在 `404 NOT_FOUND`）；状态 `active`（`frozen` → `400 VALIDATION_ERROR`） | `recharge_orders.user_id` |
| `amount` | number | ✅ | `> 0` 且 `≤ MANUAL_TOPUP_MAX_AMOUNT`（默认 `50000.00`，配置 `system_config finance_rules` 可覆盖，读失败回退常量）；最多 2 位小数（ADR-0002） | `recharge_orders.amount`（`numeric(18,2)`） |
| `note` | string | ✅ | 非空（trim）、≤500 字 | `recharge_orders.note` |
| `transfer_no` | string | 可选 | ≤100；填写则全平台唯一（重复 `409 DUPLICATE_BUSINESS_REFERENCE`） | `recharge_orders.metadata.transfer_no` |
| `evidence_remark` | string | 可选 | ≤500 | `recharge_orders.metadata.evidence_remark` |
| `evidence_url` | — | — | 本版本不接受（凭证上传属 R9）；传入即 `400 VALIDATION_ERROR` | — |
| `topup_type` | enum | 可选 | `bank_transfer` / `grant`，仅驱动表单提示，不强制落库（`【待人工裁决】` 是否落库） | — |

- 单笔上限校验依据 ADR-0001：`> ¥50,000` 直接拒绝创建，**不进入人工上账终审档**；用户自助充值 ¥1,000,000 为独立业务对象，与人工上账不混同。
- 24h 滚动限额（ADR-0013/0022）：创建前校验操作人（`limits.operator_24h`）与被入账用户（`limits.recipient_24h`）两维度滚动累计，默认均 `50000.00`；任一超限按 `limits.exceed_action`（仅 `escalate`/`reject`）处置；`super_admin` 不豁免。优先级：`invalid input → hard business limit → 24h limit → approval threshold → normal processing`。

**响应 `201`**：
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
- 订单号：`MT` + `yyyyMMddHHmmss` + 4 位随机（`genManualOrderNo`）。
- 落库：`recharge_orders`（`method='manual'`、`status='pending'`、`order_no` 前缀 `MT`），`metadata={ source:'admin-manual-topup', created_by:<operatorId>, transfer_no?, evidence_remark? }`。
- 审计：`action='manual_topup.create'`、`resource='recharge_order'`、`resourceId=String(order.id)`、`details={ userId, amount, order_no, created_by }`。

**错误码**：
| HTTP | code | 场景 |
|:---:|------|------|
| 400 | `VALIDATION_ERROR` | amount ≤0 / 超上限 / user_id 非法 / note 缺失 / 传入 `evidence_url` / 用户状态 frozen |
| 401 | `UNAUTHORIZED` | 未登录 / Token 缺失或失效 |
| 403 | `PERMISSION_DENIED` | 无 `finance.topup` |
| 403 | `OPERATION_2FA_REQUIRED` | 缺/未启用操作 2FA；错误/过期/重放使用 2FA 固定错误码（ADR-0008） |
| 404 | `NOT_FOUND` | 用户不存在 |
| 409 | `IDEMPOTENCY_CONFLICT` | 同 Idempotency-Key 异摘要重放 |
| 409 | `DUPLICATE_BUSINESS_REFERENCE` | 同 `transfer_no` 重复创建 |
| 409/429 | 24h 限额处置 | `exceed_action=reject` 时拒绝（`【待人工裁决】` 固定错误码取值） |
| 503 | `IDEMPOTENCY_UNAVAILABLE` | Redis 幂等不可用（ADR-0009，不静默绕过） |
| 500 | `ORDER_CREATE_FAILED` | 插入失败（唯一键冲突等非预期） |

### M.2 人工上账列表
`GET /api/v1/admin/manual-topup`

**Query**：`page`、`page_size`、`status`、`transfer_no`、`start_date`、`end_date`、`user_id`
**鉴权**：`finance.topup`
**响应**：`{ code:0, message:"ok", data:{ items:[{ id, order_no, user_id, amount, method:'manual', status, status_label, approval_phase, approval_required, note, transfer_no, evidence_remark, created_at, paid_at, reviewer_id? }], page, page_size, total }, request_id }`
- 每项含 `status + approval_phase + approval_required`（ADR-0021）；`transfer_no`/`evidence_remark` 读自 `metadata`。
- 凭证上传未落地前 `evidence_url` 恒为 null（占位）。`paid→已到账`、`failed→已驳回` 前端映射不变。

### M.3 审批（通过/驳回）
`POST /api/v1/admin/manual-topup/:id/review`

**请求头**：`Authorization` + `X-Operation-2FA`（必填）
**请求体**：
```json
{ "action": "approve", "review_note": null }
```
| 字段 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `action` | enum | ✅ | `approve`（通过） / `reject`（驳回） |
| `review_note` | string | `reject` 时必填 | 驳回原因 ≤500 字 |

**审批分级（ADR-0001/0004/0021）**：服务端按金额阈值计算当前阶段并强制执行职责分离——
- ≤¥10,000：单人一级（`approval_phase: none → completed`）—— `approve` 后直接入账（`paid`）；
- >¥10,000 且 ≤¥50,000：双人（一审经 `level1`、二审经 `level2 → completed`）—— 一审仅推进阶段、`status` 保持 `pending`，二审通过才入账；
- 任一待审批阶段 `reject` → `rejected`；
- `>¥50,000` 无法通过创建生成，不进终审档。
- 职责分离（ADR-0004）：创建人≠审批人、一级≠二级，违规返回 `403`/`409`。

**通过并入账语义**（事务内，收口自 R2 `creditBalance`）：
1. 状态条件更新 `recharge_orders` `pending→paid`（`where status='pending'` 守卫，防并发重复审核）；
2. `INSERT INTO customer_balances ... ON CONFLICT (user_id) DO NOTHING`（无余额行自动建户兜底）；
3. `UPDATE customer_balances SET available_balance += amount, total_balance += amount, version += 1`（RETURNING balanceAfter）；
4. `INSERT INTO balance_transactions(type='recharge', balance_after, reference_type='recharge_order', reference_id)`；
5. `approval_phase=completed`、记录 `reviewer_id`、写审计。
- 事务提交后（不阻塞主响应）：Redis 账本可用增量同步 → 清除负余额标记（>=0 时）→ `notifyUser('recharge_success')`（站内信必发 + 按偏好邮件，ADR-0010）。

**响应 `200`**：`{ code:0, message:"ok", data:{ id, status, status_label, approval_phase, approval_required, balance_after? }, request_id }`

**错误码**：`400 VALIDATION_ERROR`（action 非法 / review_note 缺失）、`401 UNAUTHORIZED`、`403 PERMISSION_DENIED`、`403 OPERATION_2FA_REQUIRED`、`403/409`（职责分离违规）、`404 NOT_FOUND`（单据不存在）、`409 ORDER_ALREADY_PROCESSED`（重复审批）、`500 BALANCE_CREDIT_FAILED`（入账异常，理论不可达）。

### M.4 用户搜索（选择用户）
`GET /api/v1/admin/manual-topup/users`

**Query**：`search`（邮箱 精确/模糊、用户 ID 精确、手机号 精确，仅对已绑定手机号用户）、`page_size`（默认 10，≤10 条）
**鉴权**：`finance.topup`（专用轻量端点，不放开 `GET /admin/customers`，避免 agent/sales 越权看全量客户列表）
**响应**：`{ code:0, message:"ok", data:{ items:[{ id, email, name, status, available_balance }] }, request_id }`
- 仅返回 `active` 用户可入账（`frozen` 由创建校验拦截）；前端回显「邮箱 · 名称 · 用户ID · 当前余额 · 状态」。

### M.5 作废（`【待人工裁决】`）
`POST /api/v1/admin/manual-topup/:id/void`
- 人工上账「创建后取消/作废」的语义未在 ADR 中明确（PRD 口径当前为「创建后不提供取消，需撤回走驳回」）。**作废端点是否纳入 v1.0.0、对已 `pending` 与已入账单据的处理、与审计/幂等关系待人工裁决；确认前不标记 `implemented`。**

### M.6 人工上账错误码（本 topic，补充至 §B）
| 场景 | HTTP | code |
|------|------|------|
| 无 `finance.topup` 权限 | 403 | `PERMISSION_DENIED` |
| 缺/未启用操作 2FA | 403 | `OPERATION_2FA_REQUIRED` |
| 2FA 错误/过期/重放 | 403 | 2FA 固定错误码 |
| 同 Key 异摘要重放 | 409 | `IDEMPOTENCY_CONFLICT` |
| 重复转账单号 | 409 | `DUPLICATE_BUSINESS_REFERENCE` |
| 单据已处理（重复审批） | 409 | `ORDER_ALREADY_PROCESSED` |
| Redis 幂等不可用 | 503 | `IDEMPOTENCY_UNAVAILABLE` |
| 单笔超上限 / 参数非法 | 400 | `VALIDATION_ERROR` |
| 用户不存在 | 404 | `NOT_FOUND` |
| 24h 累计超限且 `exceed_action=reject` | 409/429 | `【待人工裁决】` 固定错误码取值 |
| 入账异常 | 500 | `BALANCE_CREDIT_FAILED` |

### M.7 人工上账未决事项（`【待人工裁决】` 清单，本 topic）
1. `topup_type`（bank_transfer/grant）是否作为后端落库字段（当前仅驱动表单提示）。
2. 凭证文件正式上传（`evidence_url` 落库）能力挂载（R9）；本期 `transfer_no`/`evidence_remark` 写入 `metadata`。
3. M.5 作废端点的语义与是否纳入 v1.0.0。
4. 24h 累计超限 `exceed_action=reject` 的固定错误码取值。
5. `approval_required`（当前操作者是否仍需审批）的服务端判定细节（依赖当前操作者已审批阶段）`【待人工裁决】` 细化。

---

## A. 退款 / 红冲端端点（本 topic）

### A.1 发起退款/红冲
`POST /api/v1/admin/refunds`

**请求**（`Idempotency-Key` 必填）：
```json
{
  "userId": 10086,
  "refundType": "balance_refund",        // balance_refund | channel_refund | reversal
  "amount": "200.00",
  "refReason": "API 失败多扣",
  "refCallLogId": null,                   // balance_refund 关联计费单据（可选）
  "refOrderId": 123,                      // channel_refund 关联充值订单
  "channel": "alipay",                    // channel_refund 原路通道
  "notifyUser": true,
  "note": "客服核实确认"
}
```

**校验**：
- 类型 `balance_refund` → 关联计费单据；`channel_refund` → 关联充值订单；`reversal` → 关联待纠错原单。
- 退款金额 ≤ 可退金额上限；原单金额不可修改/删除。
- 同一业务事件不得同时"原路 + 余额回滚"。

**响应**（`201`）：
```json
{ "code": 0, "message": "ok", "data": { "id": 5001, "refundNo": "RF-260731-0001", "status": "pending" }, "request_id": "req_..." }
```

**错误**：`400 参数`、`409 DUPLICATE_BUSINESS_REFERENCE`、`403 PERMISSION_DENIED`。

### A.2 退款/红冲列表
`GET /api/v1/admin/refunds`

**Query**：`page`、`page_size`、`status`、`refund_type`、`start_date`、`end_date`、`search`（订单号/用户）
**响应**：`{ code:0, message:"ok", data:{ items:[...], page, page_size, total }, request_id }`

### A.3 退款/红冲详情
`GET /api/v1/admin/refunds/:id`
返回明细、用户账户状况、审核/执行时间线、流水与审计关联。

### A.4 审核
`POST /api/v1/admin/refunds/:id/review`

**请求**（操作级 2FA 必填）：
```json
{ "action": "approve", "stage": "first|second|super", "note": "金额核对一致" }
```
- 审批阈值按 ADR-0001：≤¥10k 单人、>¥10k 双人、>¥100k 追加 `super_admin` 终审。
- 职责分离：创建人≠审批人、初审≠复审（返 `403/409`）。

**响应**：状态推进；终审通过 → `approved`。驳回见 A.5。

### A.5 驳回
`POST /api/v1/admin/refunds/:id/reject`
**请求**：`{ "rejectReason": "...", "operation2fa": "..." }`
**响应**：状态 → `rejected`（终态）。

### A.6 执行 / 重试
`POST /api/v1/admin/refunds/:id/execute`

**请求**（2FA + `Idempotency-Key` 必填）：
```json
{ "operation2fa": "...", "idempotency_key": "rd-..." }
```

**执行语义（按 ADR-0020 分型）**：
| 类型 | 执行动作 |
|------|---------|
| `balance_refund` | 校验余额 → `UPDATE customer_balances` + `INSERT balance_transactions(type='refund', balance_after)` + 单据更新，事务内原子；余额为负回滚 `INSUFFICIENT_BALANCE` |
| `channel_refund` | 调用支付通道原路退款（异步回调）→ 成功后更新充值订单退款状态；**不同时余额回滚** |
| `reversal` | 生成独立反向资金记录 → 成功生效后原单转 `reversed`；失败不转 |

**响应**：`processing → completed`；执行异常 → `failed`（可重试，重试 ≤3 次）。

### A.7 作废（`【待人工裁决】`）
`POST /api/v1/admin/refunds/:id/void`
作废未执行/误建的退款申请。**作废语义（能否作废已 `approved` 但未执行单、与审计/幂等的关系）待人工裁决；确认前此端点不标记 `implemented`。**

### A.8 退款/红冲统计
`GET /api/v1/admin/refunds/summary`（按日/周/月汇总退款笔数、金额，按类型拆分）

---

## B. 错误码（本 topic 相关，ADR-0011/0008/0009）
| 场景 | HTTP | code |
|------|------|------|
| 无权限 | 403 | `PERMISSION_DENIED` |
| 缺/未启用操作 2FA | 403 | `OPERATION_2FA_REQUIRED` |
| 2FA 错误/过期/重放 | 403 | 2FA 固定错误码 |
| 同 Key 异摘要重放 | 409 | `IDEMPOTENCY_CONFLICT` |
| 重复业务凭证 | 409 | `DUPLICATE_BUSINESS_REFERENCE` |
| 单据已处理 | 409 | `ORDER_ALREADY_PROCESSED` |
| Redis 幂等不可用 | 503 | `IDEMPOTENCY_UNAVAILABLE` |
| 余额不足（禁负） | 422 | `INSUFFICIENT_BALANCE` |
| 余额账户缺失 | 404 | `BALANCE_NOT_FOUND` |
| 原单金额被改/删除 | 409 | `SOURCE_ORDER_MUTATED`（`【待人工裁决】` 是否单独定义错误码） |

## C. 未决事项（`【待人工裁决】` 清单）
1. A.7 作废端点的语义与是否纳入 v1.0.0。
2. A.2 列表与 A.8 统计的字段细化（是否需按运营口径导出）。
3. 线下兜底退款（充值订单无法原路）的具体执行与账号侧规则。
4. `SOURCE_ORDER_MUTATED`（原单被改）是否单独定义，还是复用 `ORDER_ALREADY_PROCESSED`。

> 人工上账端点见 §M，调账端点见 §D，充值审核端点见对应模块文档；结算与对账端点见下文 §S。本节补写者仅负责退款/红冲 topic。

---

## S. 结算与对账端点（本 topic）

> 事实来源：`ref-4.4.5-reconciliation-prd.md`（§4.3、§5.3、§9.2）、`SPEC-§29`（§29.3、§29.8）、`supplement/02`（§三）、`sprint-1/03`（§4–7）。`platform_ledger` 相关端点为预留（ADR-0012）。

### S.1 对账任务发起（运行对账）

#### POST `/api/v1/admin/finance/reconciliation/run`
- **权限**：`RECONCILIATION_VIEW`
- **请求体**：
```json
{
  "startDate": "2026-07-01",
  "endDate": "2026-07-27",
  "reconType": "full"
}
```
- **校验**：`startDate ≤ endDate`；范围 ≤ `maxCustomRangeDays`（默认 90）；`endDate ≤ 当前`；同一 `(startDate,endDate,reconType)` 不可并行（Redis 锁 `recon:lock:{start}:{end}:{type}`，TTL 600s）。
- **响应 `code=0`**：
```json
{
  "data": {
    "reportId": 42,
    "summary": { "totalOrders": 15820, "matchedOrders": 15815, "mismatchedOrders": 5,
                 "totalAmount": "123456.789000", "difference": "0.050000" },
    "mismatches": [],
    "status": "completed"
  }
}
```
- **错误**：参数不合法 `400 VALIDATION_ERROR`；锁不可用 `503 IDEMPOTENCY_UNAVAILABLE`；无权限 `403 PERMISSION_DENIED`。
- `reconType ∈ full/recharge/balance/commission/withdraw/consumption`（默认 `full`）。

#### GET `/api/v1/admin/finance/reconciliation/reports`
- **权限**：`RECONCILIATION_VIEW`；**Query**：`reconType, startDate, endDate, status, page, pageSize`。
- **返回** 报告列表（字段见 `reconciliation_reports`）。

#### GET `/api/v1/admin/finance/reconciliation/reports/:id`
- **权限**：`RECONCILIATION_VIEW`；**返回** 报告详情（含汇总、各维度、资金平衡校验、异常明细）。

#### GET `/api/v1/admin/finance/reconciliation/export/:id`
- **权限**：`RECONCILIATION_VIEW`；**返回** CSV（`text/csv; charset=utf-8`，UTF-8 BOM，Excel 兼容）含汇总 + 异常明细。

### S.2 差异查看

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/admin/finance/reconciliation/differences` | `RECONCILIATION_VIEW` | 差异列表（Query：`reportId?,severity?,mismatchType?,status?,page,pageSize`） |
| GET | `/api/v1/admin/finance/reconciliation/differences/:id` | `RECONCILIATION_VIEW` | 差异详情（含关联原始数据与建议操作） |
| GET | `/api/v1/admin/finance/reconciliation/differences/stats` | `RECONCILIATION_VIEW` | 差异统计（待处理数、总差异金额、按级别分布） |
| GET | `/api/v1/admin/finance/reconciliation/differences/export` | `RECONCILIATION_VIEW` | 差异报告导出（CSV） |

### S.3 差异处理

#### POST `/api/v1/admin/finance/reconciliation/mismatches/:id/resolve`
- **权限**：`FINANCE_COMMISSION`；补账/核销等写操作需操作级 2FA、幂等（`Idempotency-Key`）。
- **请求体**：
```json
{
  "action": "resolve | auto_fix | false_positive | ignore",
  "note": "处理备注(可选)",
  "autoFixType": "balance_adjust | deduct_retroactively | reverse_duplicate"
}
```
- **语义**：`resolve`=标记已修复（`status=resolved`）；`auto_fix`=自动补账/补扣（写 `balance_transactions`，禁负）；`false_positive`=标记误报；`ignore`=标记忽略（note 注明）。
- **错误**：无权限 `403`；缺/未启用 2FA `403 OPERATION_2FA_REQUIRED`；余额不足 `422 INSUFFICIENT_BALANCE`；状态不匹配 `400`/`409`；幂等冲突 `409 IDEMPOTENCY_CONFLICT`。

#### POST `/api/v1/admin/finance/reconciliation/undo-duplicate`
- **权限**：`FINANCE_COMMISSION`；语义：撤销重复余额记录（写负值），用于 `duplicate_record`。
- **来源未明确** `【待人工裁决】` 是否单列端点或并入 `resolve(action=auto_fix, autoFixType=reverse_duplicate)`。

### S.4 确认平账（对账周期关闭）

> 来源中"对账周期关闭/确认平账"由财务在报告层面确认；独立写端点在来源中未给出明确路由：

> `POST /api/v1/admin/finance/reconciliation/reports/:id/close`（**建议端点**，标记报告资金平衡已确认）——来源未定义，`【待人工裁决】` 是否设为独立权限点（如 `FINANCE_RECON_APPROVE`）并在平账/锁账前强制。

### S.5 代理结算对账（sprint-1/03 §4）

#### POST `/api/v1/admin/finance/settlement-cycles/generate` — 手动关账
- **权限**：`settlement.generate`；操作级 2FA、幂等。
- **请求体**：`{ "periodStart":"2026-07-01", "periodEnd":"2026-07-31" }`
- **校验**：日期 `YYYY-MM-DD`；`periodEnd > periodStart`；跨度 ≤366 天；周期未关账。
- **响应**：`{ cycleId, periodStart, periodEnd, agentBillCount }`。
- **错误**：`400 VALIDATION_ERROR`、`403 FORBIDDEN`、`409 CYCLE_ALREADY_CLOSED`。

#### GET `/api/v1/admin/finance/settlement-cycles` — 周期列表
- **权限**：`RECONCILIATION_VIEW`（结算查看类权限点绑定 `【待人工裁决】`）。
- **Query**：`status(open/closed/settled), limit(≤100), offset`；**返回** 周期 + `totalBills/pendingBills/settledBills`。

#### GET `/api/v1/admin/finance/settlements` — 结算单列表
- **权限**：`RECONCILIATION_VIEW`；**Query**：`cycle_id(必填), status, search, limit, offset`。
- **返回** 结算单（`totalCommission/settledAmount/adjustmentAmount/adjustmentReason/status`）。

#### GET `/api/v1/admin/finance/settlements/:id` — 结算单详情
- **权限**：`RECONCILIATION_VIEW`；**返回** 结算单 + 周期信息 + 操作日志（`generate/confirm/auto_confirm/adjust`）。

#### GET `/api/v1/admin/finance/settlements/:id/details` — 结算明细
- **权限**：`RECONCILIATION_VIEW`；**Query**：`limit, offset`；**返回** 明细 + `summary{totalAmount,totalTokens,modelCount}`。

#### GET `/api/v1/admin/finance/settlements/:id/export` — 导出 CSV
- **权限**：`RECONCILIATION_VIEW`；**返回** `text/csv`（UTF-8 BOM），含客户姓名列。

#### POST `/api/v1/admin/finance/settlements/:id/adjust` — 调整金额
- **权限**：`settlement.adjust`；操作级 2FA、幂等。
- **请求体**：`{ "adjustmentAmount": -23.50, "reason": "客户退款扣除佣金" }`
- **校验**：仅 `pending` 可调整；`adjustmentAmount` ≤4 位小数；`reason` 5–500 字；调整后 `settledAmount ≥ 0`。
- **错误**：`404 SETTLEMENT_NOT_FOUND`、`400 SETTLEMENT_STATUS_MISMATCH`、`400 SETTLEMENT_AMOUNT_NEGATIVE`、`400 VALIDATION_ERROR`、`403 FORBIDDEN`。

### S.6 代理端结算（补充）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/agent/settlements` | agent | 结算单列表（含 stats） |
| GET | `/api/v1/agent/settlements/:id` | agent | 详情（归属校验，非本人 `404 SETTLEMENT_NOT_FOUND`） |
| POST | `/api/v1/agent/settlements/:id/confirm` | agent | 确认结算（`pending→settled`，金额转可提现） |
| GET | `/api/v1/agent/settlements/:id/export-csv` | agent | 导出（不含客户姓名列，隐私保护） |

### S.7 结算/对账错误码汇总
| HTTP | error_code | 场景 |
|------|-----------|------|
| 400 | `VALIDATION_ERROR` | 日期/范围/调整原因校验 |
| 400 | `SETTLEMENT_STATUS_MISMATCH` | 已 settled 再确认/调整 |
| 400 | `SETTLEMENT_AMOUNT_NEGATIVE` | 调整后金额 < 0 |
| 403 | `FORBIDDEN` / `PERMISSION_DENIED` | 无权访问 |
| 403 | `OPERATION_2FA_REQUIRED` | 缺/未启用操作 2FA |
| 404 | `SETTLEMENT_NOT_FOUND` / `BALANCE_NOT_FOUND` | 结算单不存在/非本人；余额账户缺失 |
| 409 | `CYCLE_ALREADY_CLOSED` | 周期已关账 |
| 409 | `IDEMPOTENCY_CONFLICT` / `DUPLICATE_BUSINESS_REFERENCE` / `ORDER_ALREADY_PROCESSED` | 幂等/重复引用/已处理 |
| 422 | `INSUFFICIENT_BALANCE` | 补账负余额/余额不足（禁负） |
| 503 | `IDEMPOTENCY_UNAVAILABLE` | Redis 锁/幂等不可用 |

### S.8 结算/对账未决事项（`【待人工裁决】`）
1. "确认平账"独立端点（`reports/:id/close`）的权限点与校验口径。
2. `undo-duplicate` 是否单列端点或并入 `resolve`。
3. 结算查看类端点的具体权限点绑定（`RECONCILIATION_VIEW` vs `settlement.*`）。
4. 结算周期创建采用同步返回 vs 异步任务（TaskFlow）接口形态。

---

## D. 调账端端点（balance-adjustment，本 topic）

> 权限点均为 `finance.adjust`（仅 admin/super_admin；super_admin 具通配）。除只读查询外均挂操作级 2FA + 二次确认。契约来源 `ARCH-整改R5-R7-资金风控.md` §2.3.3 / §2.3.4 / §4.8，与 `SPEC-BILLING-003` §6、`PRD-BILLING-003` §9 对齐。落地前需完成 `adjustment_records` 迁移（状态枚举追加 `pending_super` + 新列 `super_reviewed_by`/`limit_escalated`/`escalation_reason`，migration 0030）；未 audit 端点不得标记 `implemented`。

### D.1 调账端点清单

| 方法 | 路径 | 说明 | 2FA+确认 |
|------|------|------|:---:|
| POST | `/api/v1/admin/adjust` | 发起调账（创建，含免审生效） | ✅ |
| POST | `/api/v1/admin/adjust/:id/approve` | 一级审批（单审档生效） | ✅ |
| POST | `/api/v1/admin/adjust/:id/review` | 二级 / super 终审（扩展 `pending_super`；终审强制 super_admin） | ✅ |
| POST | `/api/v1/admin/adjust/:id/reject` | 驳回（原因必填） | ✅ |
| POST | `/api/v1/admin/adjust/:id/reverse` | 红冲（加钱方向预占限额；R12 前保持直接生效不建审批链【待人工裁决】） | ✅ |
| GET | `/api/v1/admin/adjust/pending?level=1|2|3` | 待我审批（含 level=3 = `pending_super`） | 否 |
| GET | `/api/v1/admin/adjust/ledger` | 台账（含审批链 / `limit_escalated` / `stalled`） | 否 |

### D.2 发起 `POST /api/v1/admin/adjust`（创建类幂等）

**请求头**：`Authorization: Bearer <登录JWT>`；`Idempotency-Key`（必须，ADR-0009）；`X-Operation-Token`（操作级 2FA 令牌）；`X-Operation-Confirm: confirmed`（二次确认标记）。

**请求体**：

| 字段 | 必填 | 类型 | 校验 |
|------|------|------|------|
| `user_id` | ✅ | integer | 用户存在且 active（不存在 `404 NOT_FOUND`；frozen → `400 VALIDATION_ERROR`） |
| `direction` | ✅ | enum(`increase`/`decrease`) | — |
| `amount` | ✅ | numeric(18,2) | >0；≤50,000（ADR-0001，超限拒绝创建，不进入终审档）；最多 2 位小数（ADR-0002） |
| `subject` | ✅ | varchar(≤50) | 会计科目；白名单免审判定依据 `{赠送,补偿,纠错}` |
| `reason` | ✅ | varchar(≤500) | trim 非空 |

**响应（成功 200）**：`data` 含 `id`、`order_no`、`user_id`、`direction`、`amount`、`status`、`approval_level`(1|2|3)、`limit_escalated`(bool)、`message`（"已提交一级/双人/终审审批"或"已生效（白名单免审）"）。

- 24h 限额（ADR-0013/0022）：创建前校验操作人 `limits.operator_24h` 与被入账用户 `limits.recipient_24h` 双维度滚动累计（默认 ¥50,000），任一超限按 `exceed_action`（`escalate` 升级至少双人 / `reject` → 429 `DAILY_LIMIT_EXCEEDED`）；`super_admin` 不豁免（B8）。优先级 `invalid input → hard business limit → 24h limit → approval threshold → normal`。
- 调增计入限额、调减不计入（B9）；驳回/红冲不回退累计（B19）。

**错误码**：`400 VALIDATION_ERROR`、`403 PERMISSION_DENIED`、`403 OPERATION_2FA_REQUIRED`/`INVALID`/`EXPIRED`/`NOT_ENABLED`/`OPERATION_CONFIRM_REQUIRED`、`409 IDEMPOTENCY_CONFLICT`、`429 DAILY_LIMIT_EXCEEDED`、`404 NOT_FOUND`、`503 IDEMPOTENCY_UNAVAILABLE`。

### D.3 一级审批 `POST /api/v1/admin/adjust/:id/approve`

- **请求头**：`Idempotency-Key`；`X-Operation-Token`；`X-Operation-Confirm`；body 可选 `escalation_reason`（**降级代审时必填**，审计标记 `degraded:true`）。
- **成功**：单审档 → `data.status='approved'` + `balance_after`（生效入账）；双人/终审档 → `status='pending'`（记 `approvedBy`）+ `approval_level` + `message:'一级审批通过，等待双人复核'`（不入账）。
- **错误**：审批人=申请人→400（E3）；终态/并发→409 `ORDER_ALREADY_PROCESSED`（E6/E7）。

### D.4 二级 / 终审 `POST /api/v1/admin/adjust/:id/review`

- 终审（`pending_super`）强制 `operator.role==='super_admin'` 且 ≠ requestedBy/approvedBy/reviewedBy，否则 403/400（E5）。
- 双人档二级通过 → `status='approved'` + `balance_after`（生效）；终审档 → `pending_super`（记 `reviewedBy`），super 终审通过 → `approved` + `balance_after`。
- 校验：二级 ≠ 一级（E4）。

### D.5 驳回 `POST /api/v1/admin/adjust/:id/reject`

- `reason`（驳回原因）必填（400 否则）；单据 → `rejected`；不改余额；24h 累计不回退（B19）。

### D.6 红冲 `POST /api/v1/admin/adjust/:id/reverse`

- 请求头含 2FA 令牌 + 确认标记；`Idempotency-Key`。
- 加钱方向（调增红冲为扣款方向不计入限额；调减红冲为加钱方向预占限额，B9）。
- 创建独立反向资金记录并重新按规则定级；反向记录生效后原单 → `reversed`（ADR-0003）。红冲审批链 R12 前不建（【待人工裁决】，ARCH §8 R12 边界）。

### D.7 列表通用新增字段（向后兼容，纯增量）

`GET /api/v1/admin/adjust/pending` 与 `GET /api/v1/admin/adjust/ledger` 每条返回：

```json
{
  "approval_level": 2,
  "approval_phase": "level2_pending",
  "first_reviewer_id": 5,
  "second_reviewer_id": null,
  "super_reviewer_id": null,
  "limit_escalated": true,
  "escalation_reason": "24h 累计超限，升级双人审批",
  "stalled": false
}
```

- `stalled`：台账超时标记（懒计算：state in pending/pending_level2/pending_super 且 now-created_at > SLA，SLA 默认初审 12h / 复审+终审 24h，对齐 ref §7.2.2；B15）。
- 台账另展示审批链（申请人 → 一级 → 二级 → 终审）。

### D.8 调账相关配置端点

| 方法 | 路径 | 权限点 | 2FA+确认 | 说明 |
|------|------|--------|:---:|------|
| GET | `/api/v1/admin/finance/rules` | `sys.config` | 否 | 读大额规则/限额/2FA 策略（只读不拦 2FA） |
| PUT | `/api/v1/admin/finance/rules` | `sys.config`（`operation_2fa` 段仅 super_admin） | ✅ | 保存风控配置；保存校验 + `resetFinanceRulesCache` + 审计 |

> 配置权限归属 B17 建议并入 `sys.config`；`operation_2fa` 段仅 super_admin。若权限树调整（新增 `finance.rule_config` 或改挂端点）以实际裁决为准（【待人工裁决】）。

### D.9 调账端点错误码（ADR-0011/0008/0009/0022/0004）

| 场景 | HTTP | code |
|------|------|------|
| 审批人=申请人、二维=一级、终审=前两级、降级代审缺原因、阶段不匹配、金额超上限 | 400 | `VALIDATION_ERROR` |
| 终审非 super_admin；无 `finance.adjust` 权限点 | 403 | `FORBIDDEN` / `PERMISSION_DENIED` |
| 并发重复审批/终态再审批（E6/E7） | 409 | `ORDER_ALREADY_PROCESSED` |
| 创建预检超硬限且 `exceed_action=reject`（E20） | 429 | `DAILY_LIMIT_EXCEEDED` |
| 缺令牌/令牌无效/过期/未启用 | 403 | `OPERATION_2FA_REQUIRED` / `OPERATION_2FA_INVALID` / `OPERATION_2FA_EXPIRED` / `OPERATION_2FA_NOT_ENABLED`（**不用 401** 防登出） |
| 缺二次确认标记（E30） | 403 | `OPERATION_CONFIRM_REQUIRED` |
| 锁定中（E23/E31） | 429 | `OPERATION_2FA_LOCKED` |
| Key 异摘要重放 | 409 | `IDEMPOTENCY_CONFLICT` |
| 幂等基础设施不可用 | 503 | `IDEMPOTENCY_UNAVAILABLE` |

### D.10 调账未决事项（【待人工裁决】）
1. 红冲审批链（R12）：当前 `POST /admin/adjust/:id/reverse` 不建审批链，R12 阶段叠加；是否纳入 v1.0.0 待裁决。
2. 风控规则配置权限归属（B17）：`sys.config` 或新增 `finance.rule_config`；`operation_2fa` 段仅 super_admin——建议值已冻结，若权限树调整以实际为准。
3. 调减/扣减生效通知：本期不覆盖，事件与文案待后续定义。
