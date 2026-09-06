# API：结算与对账（settlement-and-reconciliation）

- 文档 ID：API-BILLING-005
- 状态：approved
- 生效版本：v1.0.0
- 主题：结算与对账（settlement-and-reconciliation）
- 上游 ADR：ADR-0002、ADR-0003、ADR-0004、ADR-0006、ADR-0008、ADR-0009、ADR-0010、ADR-0011、ADR-0012、ADR-0020、ADR-0029
- 事实来源：`docs/ref-4.4.5-reconciliation-prd.md`（§2、§4.1、§5、§9.2）、`docs/SPEC-§29-资金与对账管理.md`（§29.3、§29.8）、`docs/supplement/02-对账差异处理定量规则.md`（§三）、`docs/sprint-1/03-settlement-overview.md`（§4–7）、`docs/sprint-1/04-settlement-frontend.md`（§5）

> **头部说明（协作隔离）**：本文件为结算/对账 topic 的**专属 API 契约正文**，与人工上账/调账/退款主题在 `docs/05-api/admin/finance.md` 中的内容**相互独立**，避免同写同一文件造成覆盖丢失。统一合并方可将本文件 §一/§二/§三 合并进 `docs/05-api/admin/finance.md`。本文件不改动 `finance.md`。

## 统一约束
资金写端点必须同时满足权限点、操作级 2FA、幂等和状态条件更新；响应遵循 ADR-0011（`{ code:0, message:"ok", data, request_id }`，错误 `code/message/details/request_id`，列表 `items/page/page_size/total`）。

---

## 一、端点契约

### 1.1 对账任务发起（运行对账）

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
- **字段校验**：
  | 字段 | 必填 | 规则 |
  |------|------|------|
  | `startDate` | 是 | `YYYY-MM-DD`；`startDate ≤ endDate` |
  | `endDate` | 是 | ≤ 当前日期；`endDate - startDate ≤ maxCustomRangeDays(默认90)` |
  | `reconType` | 否 | `full/recharge/balance/commission/withdraw/consumption`，默认 `full` |
- **并发**：同一 `(startDate,endDate,reconType)` 不可并行（Redis 锁 `recon:lock:{start}:{end}:{type}`，TTL 600s）。
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
- **错误**：`400 VALIDATION_ERROR`；`503 IDEMPOTENCY_UNAVAILABLE`（锁不可用）；`403 PERMISSION_DENIED`。

#### GET `/api/v1/admin/finance/reconciliation/reports`
- **权限**：`RECONCILIATION_VIEW`
- **Query**：`reconType, startDate, endDate, status, page, pageSize`
- **返回** 报告列表（字段见 `reconciliation_reports`：《ref-4.4.5 §4.1》）。

#### GET `/api/v1/admin/finance/reconciliation/reports/:id`
- **权限**：`RECONCILIATION_VIEW`
- **返回** 报告详情（含汇总、各维度、资金平衡校验、异常明细）。

#### GET `/api/v1/admin/finance/reconciliation/export/:id`
- **权限**：`RECONCILIATION_VIEW`
- **返回** CSV（`text/csv; charset=utf-8`，UTF-8 BOM 开头，Excel 兼容），含汇总 + 异常明细。

### 1.2 差异查看

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/admin/finance/reconciliation/differences` | `RECONCILIATION_VIEW` | 差异列表（Query：`reportId?,severity?,mismatchType?,status?,page,pageSize`） |
| GET | `/api/v1/admin/finance/reconciliation/differences/:id` | `RECONCILIATION_VIEW` | 差异详情（含关联原始数据与建议操作） |
| GET | `/api/v1/admin/finance/reconciliation/differences/stats` | `RECONCILIATION_VIEW` | 差异统计（待处理数、总差异金额、按级别分布） |
| GET | `/api/v1/admin/finance/reconciliation/differences/export` | `RECONCILIATION_VIEW` | 差异报告导出（CSV） |

**差异字段**（`reconciliation_mismatches`）：`reportId / orderId / refType / refId / mismatchType / expectedValue / actualValue / reason / severity(low/mid/high/critical) / status(pending/processing/resolved/false_positive/ignored) / resolutionNote / resolvedBy / resolvedAt`。
> 差异处理状态字段（`status` + `resolvedAt/resolvedBy/resolutionNote`）为需新增能力；历史实现仅 `resolved boolean`（ref-4.4.5 附录待增强项 1）。

### 1.3 差异处理

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
- **职责分离**：处理人 ≠ 复核人（ADR-0004）。
- **错误**：`403 PERMISSION_DENIED`；`403 OPERATION_2FA_REQUIRED`；`422 INSUFFICIENT_BALANCE`（补账负余额/余额不足）；`400`/`409 SETTLEMENT_STATUS_MISMATCH/ORDER_ALREADY_PROCESSED`；`409 IDEMPOTENCY_CONFLICT`；`503 IDEMPOTENCY_UNAVAILABLE`。

#### POST `/api/v1/admin/finance/reconciliation/undo-duplicate`
- **权限**：`FINANCE_COMMISSION`
- **语义**：撤销重复余额记录（写负值），用于 `duplicate_record` 差异（ref-4.4.5 §5.3、§6 附录）。
- **`【待人工裁决】`** 是否单列端点或并入 `resolve(action=auto_fix, autoFixType=reverse_duplicate)`。

### 1.4 确认平账（对账周期关闭）

> 来源中"对账周期关闭/确认平账"由财务在报告层面确认；独立写端点在来源中未定义：

> `POST /api/v1/admin/finance/reconciliation/reports/:id/close`（**建议端点**，标记报告资金平衡已确认）——来源未定义，权限点（如 `FINANCE_RECON_APPROVE`）与校验口径 `【待人工裁决】`。

### 1.5 代理结算对账（sprint-1/03 §4）

#### POST `/api/v1/admin/finance/settlement-cycles/generate` — 手动关账
- **权限**：`settlement.generate`；操作级 2FA、幂等。
- **请求体**：`{ "periodStart":"2026-07-01", "periodEnd":"2026-07-31" }`
- **校验**：日期 `YYYY-MM-DD`；`periodEnd > periodStart`；跨度 ≤366 天；周期未关账（唯一索引 `(periodStart,periodEnd)`）。
- **响应**：`{ cycleId, periodStart, periodEnd, agentBillCount }`
- **错误**：`400 VALIDATION_ERROR`；`403 FORBIDDEN`；`409 CYCLE_ALREADY_CLOSED`。

#### GET `/api/v1/admin/finance/settlement-cycles` — 周期列表
- **权限**：`RECONCILIATION_VIEW`（结算查看类权限点绑定 `【待人工裁决】`）
- **Query**：`status(open/closed/settled), limit(≤100), offset`
- **返回** 周期 + `totalBills/pendingBills/settledBills`。

#### GET `/api/v1/admin/finance/settlements` — 结算单列表
- **权限**：`RECONCILIATION_VIEW`
- **Query**：`cycle_id(必填), status(pending/settled), search(≤50字), limit(≤100), offset`
- **返回** 结算单（`totalCommission/settledAmount/adjustmentAmount/adjustmentReason/status`）。

#### GET `/api/v1/admin/finance/settlements/:id` — 结算单详情
- **权限**：`RECONCILIATION_VIEW`
- **返回** 结算单 + 周期信息 + 操作日志（`generate/confirm/auto_confirm/adjust`）。

#### GET `/api/v1/admin/finance/settlements/:id/details` — 结算明细
- **权限**：`RECONCILIATION_VIEW`
- **Query**：`limit, offset`
- **返回** 明细 + `summary{totalAmount,totalTokens,modelCount}`。

#### GET `/api/v1/admin/finance/settlements/:id/export` — 导出 CSV
- **权限**：`RECONCILIATION_VIEW`
- **返回** `text/csv`（UTF-8 BOM），含客户姓名列。

#### POST `/api/v1/admin/finance/settlements/:id/adjust` — 调整金额
- **权限**：`settlement.adjust`；操作级 2FA、幂等。
- **请求体**：`{ "adjustmentAmount": -23.50, "reason": "客户退款扣除佣金" }`
- **校验**：仅 `pending` 可调整；`adjustmentAmount` ≤4 位小数；`reason` 5–500 字；调整后 `settledAmount ≥ 0`。
- **错误**：`404 SETTLEMENT_NOT_FOUND`、`400 SETTLEMENT_STATUS_MISMATCH`、`400 SETTLEMENT_AMOUNT_NEGATIVE`、`400 VALIDATION_ERROR`、`403 FORBIDDEN`。

### 1.6 代理端结算（补充，sprint-1/03 §5）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/agent/settlements` | agent | 结算单列表（含 stats：pending/settled 计数） |
| GET | `/api/v1/agent/settlements/:id` | agent | 详情（归属校验，非本人返回 `404 SETTLEMENT_NOT_FOUND`） |
| POST | `/api/v1/agent/settlements/:id/confirm` | agent | 确认结算（`pending→settled`，金额转可提现，状态守卫） |
| GET | `/api/v1/agent/settlements/:id/export-csv` | agent | 导出（不含客户姓名列，隐私保护） |

---

## 二、错误码汇总（结算/对账）

| HTTP | error_code | 场景 |
|------|-----------|------|
| 400 | `VALIDATION_ERROR` | 日期/范围/调整原因校验 |
| 400 | `SETTLEMENT_STATUS_MISMATCH` | 已 settled 再确认/调整 |
| 400 | `SETTLEMENT_AMOUNT_NEGATIVE` | 调整后金额 < 0 |
| 403 | `FORBIDDEN` / `PERMISSION_DENIED` | 无权访问 |
| 403 | `OPERATION_2FA_REQUIRED` | 缺/未启用操作 2FA |
| 404 | `SETTLEMENT_NOT_FOUND` / `BALANCE_NOT_FOUND` | 结算单不存在/非本人；余额账户缺失 |
| 409 | `CYCLE_ALREADY_CLOSED` | 周期已关账重复关账 |
| 409 | `IDEMPOTENCY_CONFLICT` / `DUPLICATE_BUSINESS_REFERENCE` / `ORDER_ALREADY_PROCESSED` | 幂等/重复引用/已处理 |
| 422 | `INSUFFICIENT_BALANCE` | 补账负余额/余额不足（禁负） |
| 503 | `IDEMPOTENCY_UNAVAILABLE` | Redis 锁/幂等不可用 |

---

## 三、权限点
- `RECONCILIATION_VIEW`：对账 run/reports/export、差异查看、结算单查询。
- `FINANCE_COMMISSION`：差异处理（resolve/auto_fix/ignore）。
- `settlement.generate`：创建结算周期/关账。
- `settlement.adjust`：调整结算金额。
- agent（端角色）：代理端结算单查看/确认/导出。

---

## 四、未决事项（`【待人工裁决】`）
1. "确认平账"独立端点（`reports/:id/close`）的权限点与校验口径。
2. `undo-duplicate` 是否单列端点或并入 `resolve`。
3. 结算查看类端点的具体权限点绑定（`RECONCILIATION_VIEW` vs `settlement.*`）。
4. 结算周期创建采用同步返回 vs 异步任务（TaskFlow）接口形态。
5. 对账差异自动修复/告警金额阈值在 ref-4.4.5 §9.3 与 supplement/02 间的口径统一。

> 合并说明：统一合并方可将本文件 §一/§二/§三 并入 `docs/05-api/admin/finance.md`，并将本文件移入 `_archive/` 或删除。`platform_ledger` 相关总账/结转端点按 ADR-0012 本期不启用，不列入契约。