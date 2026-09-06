# API：调账（balance-adjustment）

- 文档 ID：API-BILLING-ADJ
- 状态：approved
- 生效版本：v1.0.0
- 对应 PRD：`../../../02-requirements/03-billing-and-finance/balance-adjustment.md`（PRD-BILLING-003）
- 对应 SPEC：`../../../03-functional-spec/03-billing-and-finance/balance-adjustment.md`（SPEC-BILLING-003）
- 对应状态机：`../../../06-data-and-architecture/state-machines/adjustment.md`（SM-BILLING-003）
- 上游 ADR：ADR-0001、ADR-0002、ADR-0003、ADR-0004、ADR-0008、ADR-0009、ADR-0011、ADR-0013、ADR-0021、ADR-0022
- 实现依据：`docs/ARCH-整改R5-R7-资金风控.md` §2.3.3 / §2.3.4 / §4.8

> **文档定位**：调账（balances 人工调整/资金风控）在管理后台开放（open）的写/读 API 契约，作为开发与验收依据。与 `05-api/admin/finance.md`（多 topic 管理端资金 API 汇总）分文件管理；合并重建时由清单方统一并入 finance.md。
> **严格要求**：所有资金写端点必须同时满足 权限点 → 操作级 2FA + 二次确认（AND）→ 24h 限额预检 → 审批定级 → 状态条件更新 + 幂等；响应遵循 ADR-0011。未核验端点不得标记 `implemented`。

## 覆盖范围

调账（含调增/调减/红冲）的管理端 open 端点：发起、一级审批、二级/终审、驳回、红冲、待我审批、台账，以及风控规则配置端点。

## 通用约定

- **鉴权**：写端点要求持 `finance.adjust` 权限点（仅 admin / super_admin；super_admin 具通配权限，ADR-0004）。只读查询（待审/台账/规则读取）不挂操作级 2FA。
- **响应格式（ADR-0011）**：成功 `{ code:0, message:"ok", data, request_id }`；错误 `{ code, message, details, request_id }`，错误不返回业务 `data`；列表用 `items/page/page_size/total`。
- **身份**：请求头携登录 `Authorization: Bearer <登录JWT>`；操作级 2FA 通过 `POST /auth/2fa/operation-verify` 签发 `op_token`。
- **幂等（ADR-0009）**：创建 `POST /admin/adjust` 强制 `Idempotency-Key`；审批/红冲纳入幂等规范并做状态条件更新。兜底：业务唯一约束（`adjustment_no`）+ 数据库事务 + 状态守卫；Redis 仅加速锁，不可用返回 `503 IDEMPOTENCY_UNAVAILABLE`，不得静默绕过。

---

## 1. 端点清单

| 方法 | 路径 | 权限点 | 2FA+确认 | 说明 |
|------|------|--------|:---:|------|
| POST | `/api/v1/admin/adjust` | `finance.adjust` | ✅ | 发起调账（创建，含免审生效） |
| POST | `/api/v1/admin/adjust/:id/approve` | `finance.adjust` | ✅ | 一级审批（单审档生效） |
| POST | `/api/v1/admin/adjust/:id/review` | `finance.adjust` | ✅ | 二级 / super 终审（扩展 `pending_super`；终审强制 super_admin） |
| POST | `/api/v1/admin/adjust/:id/reject` | `finance.adjust` | ✅ | 驳回（原因必填） |
| POST | `/api/v1/admin/adjust/:id/reverse` | `finance.adjust` | ✅ | 红冲（加钱方向预占限额；R12 前直接生效不建审批链 `【待人工裁决】`） |
| GET | `/api/v1/admin/adjust/pending?level=1\|2\|3` | `finance.adjust` | 否 | 待我审批（含 level=3 = `pending_super`） |
| GET | `/api/v1/admin/adjust/ledger` | `finance.adjust` | 否 | 台账（含审批链 / `limit_escalated` / `stalled`） |
| GET | `/api/v1/admin/finance/rules` | `sys.config` | 否 | 读大额规则/限额/2FA 策略（只读不拦 2FA） |
| PUT | `/api/v1/admin/finance/rules` | `sys.config`（`operation_2fa` 段仅 super_admin） | ✅ | 保存风控配置；保存校验 + `resetFinanceRulesCache` + 审计 |

## 2. 发起 `POST /api/v1/admin/adjust`（创建类幂等）

**请求头**：`Authorization: Bearer <登录JWT>`；`Idempotency-Key`（必须，ADR-0009）；`X-Operation-Token`（操作级 2FA 令牌）；`X-Operation-Confirm: confirmed`（二次确认标记）。

**请求体**：

| 字段 | 必填 | 类型 | 校验 |
|------|------|------|------|
| `user_id` | ✅ | integer | 用户存在且 active（不存在 `404 NOT_FOUND`；frozen → `400 VALIDATION_ERROR`） |
| `direction` | ✅ | enum(`increase`/`decrease`) | 调增 / 调减 |
| `amount` | ✅ | numeric(18,2) | >0；≤50,000（ADR-0001，超限拒绝创建，不进入终审档）；最多 2 位小数（ADR-0002） |
| `subject` | ✅ | varchar(≤50) | 会计科目；白名单免审判定依据 `{赠送,补偿,纠错}`（R11 字典切换前为自由文本） |
| `reason` | ✅ | varchar(≤500) | trim 非空 |

**响应（成功 200）**：

```json
{
  "code": 0, "message": "ok",
  "data": {
    "id": 501, "order_no": "ADJ-20260818-0001", "user_id": 10086,
    "direction": "increase", "amount": 1000.00, "status": "pending",
    "approval_level": 1, "limit_escalated": false,
    "message": "已提交一级审批"
  },
  "request_id": "req_..."
}
```

- `approval_level` 取值 `1|2|3`；`message` 视定级为"已提交一级/双人/终审审批"或"已生效（白名单免审）"。
- 白名单免审命中（开关启用 且 科目∈`{赠送,补偿,纠错}` 且 调增 且 ≤¥1,000）→ `status='approved'`（提交即生效，计入 24h 累计）。
- 24h 限额（ADR-0013/0022）：创建前校验操作人 `limits.operator_24h` 与被入账用户 `limits.recipient_24h` 双维度滚动累计（默认 ¥50,000）；任一超限按 `exceed_action`：`escalate` 升级至少双人（`approval_level=max(金额档,2)`，不自动升终审）/ `reject` → 429 `DAILY_LIMIT_EXCEEDED`。`super_admin` 不豁免（B8）。优先级 `invalid input → hard business limit（单笔上限）→ 24h limit → approval threshold → normal`。
- 调增计入限额、调减不计入（B9）；驳回/红冲不回退累计（B19）。

## 3. 一级审批 `POST /api/v1/admin/adjust/:id/approve`

- **请求头**：`Idempotency-Key`；`X-Operation-Token`；`X-Operation-Confirm`；body 可选 `escalation_reason`（**降级代审时必填**，审计标记 `degraded:true`）。
- **成功**：单审档 → `data.status='approved'` + `balance_after`（生效入账）；双人/终审档 → `status='pending'`（记 `approvedBy`）+ `approval_level` + `message:'一级审批通过，等待双人复核'`（不入账）。
- **错误**：审批人=申请人→400（E3）；终态/并发→409 `ORDER_ALREADY_PROCESSED`（E6/E7）。

## 4. 二级 / 终审 `POST /api/v1/admin/adjust/:id/review`

- 终审（`pending_super`）强制 `operator.role==='super_admin'` 且 ≠ requestedBy/approvedBy/reviewedBy，否则 403/400（E5）。
- 双人档二级通过 → `status='approved'` + `balance_after`（生效）；终审档 → `pending_super`（记 `reviewedBy`），super 终审通过 → `approved` + `balance_after`。
- 校验：二级 ≠ 一级（E4）。缺 2FA/确认标记 → 403（R7）。

## 5. 驳回 `POST /api/v1/admin/adjust/:id/reject`

- 请求体：`{ "reason": "<驳回原因>" }`（必填，≤500，否则 400）。
- 单据 → `rejected`；不改余额；24h 累计不回退（B19）。

## 6. 红冲 `POST /api/v1/admin/adjust/:id/reverse`

- 请求头含 2FA 令牌 + 确认标记；`Idempotency-Key`。
- 加钱方向（调增红冲为扣款方向不计入限额；调减红冲为加钱方向预占限额，B9）。
- 创建独立反向资金记录并重新按规则定级；反向记录生效后原单 → `reversed`（ADR-0003）。红冲审批链 R12 前不建（`【待人工裁决】`，ARCH §8 R12 边界）。

## 7. 列表通用新增字段（向后兼容，纯增量）

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

- `stalled`：台账超时标记（懒计算：`status∈{pending,pending_level2,pending_super}` 且 `now-created_at > SLA`，SLA 默认初审 12h / 复审+终审 24h，对齐 ref §7.2.2；B15）。
- 台账另展示审批链（申请人 → 一级 → 二级 → 终审）。

## 8. 错误码（ADR-0011/0008/0009/0004/0022）

| 场景 | HTTP | code |
|------|------|------|
| 审批人=申请人、一级=二级、终审=前两级、降级代审缺原因、阶段不匹配、金额超上限/≤0、原因为空 | 400 | `VALIDATION_ERROR` |
| 终审非 super_admin；无 `finance.adjust` 权限点 | 403 | `FORBIDDEN` / `PERMISSION_DENIED` |
| 并发重复审批/终态再审批（E6/E7） | 409 | `ORDER_ALREADY_PROCESSED` |
| 创建预检超硬限且 `exceed_action=reject`（E20） | 429 | `DAILY_LIMIT_EXCEEDED` |
| 缺令牌/令牌无效/过期/未启用 | 403 | `OPERATION_2FA_REQUIRED` / `OPERATION_2FA_INVALID` / `OPERATION_2FA_EXPIRED` / `OPERATION_2FA_NOT_ENABLED`（**不用 401** 防登出） |
| 缺二次确认标记（E30） | 403 | `OPERATION_CONFIRM_REQUIRED` |
| 锁定中（E23/E31） | 429 | `OPERATION_2FA_LOCKED` |
| Key 异摘要重放 | 409 | `IDEMPOTENCY_CONFLICT` |
| 业务凭证/单号重复 | 409 | `DUPLICATE_BUSINESS_REFERENCE` |
| 用户不存在 | 404 | `NOT_FOUND` |
| 幂等基础设施不可用 | 503 | `IDEMPOTENCY_UNAVAILABLE` |
| 入账异常（理论不可达） | 500 | `BALANCE_CREDIT_FAILED` |

## 9. 未决事项（【待人工裁决】）

1. 红冲审批链（R12）：当前 `POST /admin/adjust/:id/reverse` 不建审批链，R12 阶段叠加；是否纳入 v1.0.0 待裁决。
2. 风控规则配置权限归属（B17）：`sys.config` 或新增 `finance.rule_config`；`operation_2fa` 段仅 super_admin——建议值已冻结，若权限树调整以实际为准。
3. 调减/扣减生效通知：本期不覆盖，事件与文案待后续定义。
4. `pending_bias`/直接生效语义：白名单免审开关默认关闭，变更时按提交时点固化（B18），存量待审单不重算——配置/权限树调整以实际为准。

> 合并说明：本专属文件用于替代我此前在 `05-api/admin/finance.md` 追加的 §D 调账内容；合并方可将本文件整段并入 finance.md，并从 finance.md 移除 §D 与对应头部注释，避免重复。