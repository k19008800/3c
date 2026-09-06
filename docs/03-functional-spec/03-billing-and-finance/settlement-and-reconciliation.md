# 核心资金 SPEC：结算与对账

- 文档 ID：SPEC-BILLING-005
- 状态：review
- 生效版本：v1.0.0
- 对应 PRD：`../../../../02-requirements/03-billing-and-finance/settlement-and-reconciliation.md`
- 主权威来源：`docs/ref-4.4.5-reconciliation-prd.md`、`docs/SPEC-§29-资金与对账管理.md`（§29.3、§29.8）、`docs/supplement/02-对账差异处理定量规则.md`、`docs/sprint-1/03-settlement-overview.md`、`docs/sprint-1/04-settlement-frontend.md`（ADR 冲突处均以 ADR 为准）
- 上游 ADR：ADR-0002、ADR-0003、ADR-0004、ADR-0006、ADR-0008、ADR-0009、ADR-0010、ADR-0011、ADR-0012、ADR-0020、ADR-0029

## 1. 页面与路由

| 页面 | 路由 | 入口 |
|------|------|------|
| 对账管理（工作台） | `admin/finance/reconciliation` | 管理后台 → 财务 → 对账管理 |
| 运行对账弹窗 | `admin/finance/reconciliation/run`（弹窗） | 工作台「运行对账」 |
| 对账报告详情 | `admin/finance/reconciliation/:reportId` | 报告列表「详情」 |
| 差异处理面板 | `admin/finance/reconciliation/:reportId`（行内处理） | 报告异常明细「处理」 |
| 结算管理（周期/账单） | `admin/finance/settlement` | 管理后台 → 财务 → 结算管理 Tab |
| 代理端结算对账 | `agent/finance`（结算对账 Tab） | 代理端 → 我的财务 → 结算对账 |

页面标题旁与每个操作按钮旁均有 `[?]` 帮助（见 §9 对照表）。列表页统一筛选/分页/导出交互；长任务（月结/深度对账）异步执行并提示进度，避免 HTTP 超时。

## 2. 角色与权限（ADR-0004/0008）

| 权限点 | 角色 | 说明 |
|--------|------|------|
| `RECONCILIATION_VIEW` | 财务、财务主管、`super_admin` | 查看对账报告/运行对账/导出 |
| `FINANCE_COMMISSION` | 财务、财务主管、`super_admin` | 处理/标记差异（ref-4.4.5 §5.1、§9.2） |
| `settlement.generate` | 财务、财务主管、`super_admin` | 创建结算周期/关账 |
| `settlement.adjust` | 财务主管、`super_admin` | 调整结算金额（需 2FA） |
| `settlement.confirm`(agent) | 代理商 | 确认本人结算单（归属校验，非本人 404） |

- **职责分离（强制）**：差异处理人 ≠ 复核人；结算调整操作人 ≠ 复核审批人（ADR-0004）。
- 无权限统一返回 `403 PERMISSION_DENIED`（后端校验，前端显隐不替代）。
- 补账/核销/红冲/结算调整等资金写端点强制操作级 2FA，`super_admin` 不豁免（ADR-0008）。

## 3. 字段与校验

### 3.1 运行对账参数（ref-4.4.5 §2.2）
| 字段 | 必填 | 规则 |
|------|------|------|
| `startDate` | 是 | `YYYY-MM-DD`；`startDate ≤ endDate` |
| `endDate` | 是 | ≤ 当前日期；`endDate - startDate ≤ maxCustomRangeDays(默认90)` |
| `reconType` | 否 | `full/recharge/balance/commission/withdraw/consumption`，默认 `full` |

### 3.2 对账报告字段（ref-4.4.5 §4.1）
`reconciliation_reports`：`startDate / endDate / reconType / status / totalOrders / matchedOrders / mismatchedOrders / totalAmount(numeric(18,6)) / difference(numeric(18,6)) / rechargeSummary / withdrawSummary / consumptionSummary / balanceCheck / mismatches / createdBy / startedAt / completedAt / errorMessage`。

### 3.3 差异明细字段（ref-4.4.5 §4.1）
`reconciliation_mismatches`：`reportId / orderId / refType / refId / mismatchType / expectedValue / actualValue / reason / severity(low/mid/high/critical) / status(pending/processing/resolved/false_positive/ignored) / resolutionNote / resolvedBy / resolvedAt`。
> 差异处理状态字段（`status` + `resolvedAt/resolvedBy/resolutionNote`）为对账模块需新增能力；历史实现仅 `resolved boolean`（ref-4.4.5 附录待增强项 1）。

### 3.4 结算对象字段（sprint-1/03 §2）
- `settlement_cycles`：`periodStart / periodEnd / status(open/closed/settled) / generatedAt / settledAt`。
- `agent_settlements`：`cycleId / agentId / totalCommission(numeric(18,4)) / adjustmentAmount / adjustmentReason / settledAmount / status(pending/settled) / confirmedAt / settledAt`。
- `settlement_details`：`settlementId / commissionId / amount(numeric(18,8)) / clientUserId / consumptionId / model / tokens / commissionRate`。
- `settlement_confirm_logs`：`settlementId / action(generate/confirm/auto_confirm/adjust) / operatorId / operatorRole / detail`。

### 3.5 精度校验（ADR-0002）
- 余额与对账差额判定内部 `numeric(18,8)`；佣金 `numeric(18,4)`；报告金额字段 `numeric(18,6)`。
- 补账/核销/结算调整**输入**最多 2 位小数（结算调整 `adjustmentAmount` ≤4 位小数）。
- 禁止 JS `Number` 做最终计算。

### 3.6 结算调整校验（sprint-1/03 §3.3）
- `adjustmentAmount` 精度 ≤4 位小数（超出 round(4)）。
- `reason` trim 后 5–500 字符；`adjustmentAmount≠0` 时必填。
- 调整后 `settledAmount` 不得为负（`SETTLEMENT_AMOUNT_NEGATIVE`）。
- 仅 `pending` 状态结算单可调整。

## 4. 状态机

引用并展开 [结算/对账状态机](../../06-data-and-architecture/state-machines/settlement.md)：

### 4.1 对账报告状态
```
pending(创建) → running(引擎执行比对) → completed(终态，含差异写入)
                                      → failed(超时/异常，可重跑)
```

### 4.2 结算周期与结算单
```
周期：open(已创建) → closed(已关账，账单生成待确认) → settled(全部结算，终态)
结算单：pending(待确认) → settled(终态，代理确认或 3 天自动确认)；管理员调整仅限 pending
```

### 4.3 对账差异处理状态
差异由引擎 `pending` 创建，处理流向见状态机（含补账/核销/误报/忽略等终态与复核关闭），补账/核销遵守 ADR-0020 禁止负余额。

## 5. 操作与反馈

### 5.1 操作清单
| 操作 | 端点 | 2FA | 幂等 | 反馈 |
|------|------|-----|------|------|
| 运行对账 | `POST /api/v1/admin/finance/reconciliation/run` | 否（查询类） | 唯一锁（同范围并发拦截）+ 可幂等 | 返回 reportId + 汇总 |
| 导出 CSV | `GET .../reconciliation/export/:id` | 否 | — | 下载 `text/csv`（UTF-8 BOM） |
| 处理差异 | `POST .../mismatches/:id/resolve` | 是（补账/核销） | 幂等 + 状态条件更新 | 状态更新 + 审计 |
| 创建结算周期 | `POST .../settlement-cycles/generate` | 是 | 幂等 + 唯一约束 | `cycleId + agentBillCount` |
| 调整结算金额 | `POST .../settlements/:id/adjust` | 是 | 幂等 | 更新金额 + 日志 |
| 确认结算(代理) | `POST /api/v1/agent/settlements/:id/confirm` | 否（代理本人） | 状态条件更新 | 金额转可提现 |

> 结算周期创建支持**异步长任务**语义（月结批次 50 代理/事务），HTTP 层返回任务受理，避免超时（ref-4.4.5 附录待增强 5）。

### 5.2 固定错误码（ADR-0011/0008/0009）
| 场景 | HTTP | code |
|------|------|------|
| 无权限 | 403 | `PERMISSION_DENIED` |
| 缺/未启用操作 2FA | 403 | `OPERATION_2FA_REQUIRED` |
| 同 Key 不同摘要重放 | 409 | `IDEMPOTENCY_CONFLICT` |
| 重复业务凭证/周期 | 409 | `DUPLICATE_BUSINESS_REFERENCE` |
| 单据已处理/已关账 | 409 | `CYCLE_ALREADY_CLOSED` / `ORDER_ALREADY_PROCESSED` |
| Redis 幂等/锁不可用 | 503 | `IDEMPOTENCY_UNAVAILABLE` |
| 结算单不存在/非本人 | 404 | `SETTLEMENT_NOT_FOUND` |
| 结算状态不匹配 | 400 | `SETTLEMENT_STATUS_MISMATCH` |
| 调整后金额为负 | 400 | `SETTLEMENT_AMOUNT_NEGATIVE` |
| 补账负余额/余额不足 | 422 | `INSUFFICIENT_BALANCE`（受控业务错误） |
| 参数校验失败 | 400 | `VALIDATION_ERROR` |
| 通用内部错误 | 500 | 内部错误码 |

## 6. API 契约

落地端点见 [`05-api/admin/finance.md` §S](../../05-api/admin/finance.md)，核心端点：
- `POST /api/v1/admin/finance/reconciliation/run` — 运行对账
- `GET /api/v1/admin/finance/reconciliation/reports` — 报告列表
- `GET /api/v1/admin/finance/reconciliation/reports/:id` — 报告详情（含差异）
- `GET /api/v1/admin/finance/reconciliation/export/:id` — 导出 CSV
- `POST /api/v1/admin/finance/reconciliation/mismatches/:id/resolve` — 处理差异
- `POST /api/v1/admin/finance/settlement-cycles/generate` — 手动关账
- `GET /api/v1/admin/finance/settlement-cycles` — 周期列表
- `GET /api/v1/admin/finance/settlements` / `.../:id` / `.../:id/details` / `.../:id/export` — 结算单查询/详情/明细/导出
- `POST /api/v1/admin/finance/settlements/:id/adjust` — 调整金额
- `GET/POST /api/v1/agent/settlements`（代理端列表 / 确认 / 导出）

响应格式遵循 ADR-0011：`{ code:0, message:"ok", data, request_id }`，列表 `items/page/page_size/total`。

## 7. 异常、并发与事务

### 7.1 对账任务并发与锁
- 同一 `(startDate,endDate,reconType)` 不允许并行：Redis 分布式锁 `recon:lock:{start}:{end}:{type}`（TTL 600s）；锁不可用不得绕过（ADR-0009 语义）。
- 单次对账超时 300s 标记 failed；最大异常写入 500 条截断告警；分页查询每页 1000 行防 OOM。

### 7.2 结算周期幂等（ADR-0009 + sprint-1/03）
- `settlement_cycles` 唯一索引 `(periodStart,periodEnd)`；重复创建（已 closed）返回 `409 CYCLE_ALREADY_CLOSED`。
- 关账分批（50 代理/事务）、明细批量（100 条/批）防止长时间锁表。
- 结算确认以 `WHERE status='pending'` 原子守卫；自动确认 cron 幂等（已 `settled` 不会被查到）。

### 7.3 差异补账/核销事务（ADR-0020/0006/0009）
- 补账（补退/补扣）事务：校验余额/方向 → 原子更新 `customer_balances` → 写 `balance_transactions` → 更新差异状态 → 写审计 → 任一失败整体回滚；产生负余额回滚返回 `INSUFFICIENT_BALANCE`。
- 核销：仅更新差异状态 + 写 operation_logs 备注，不影响余额。
- 资金写按 ADR-0006 资金链路：业务操作 → 原子更新余额 → 写流水 → 关联业务 → 写审计。

### 7.4 失败补偿
| 场景 | 补偿 |
|------|------|
| 对账任务中断/超时 | 标记 failed/部分完成；手动重跑受影响时段 |
| 结算关账中断 | 已提交批次事务保持，失败批次整体回滚；周期保持 open/closed 可重跑（幂等） |
| 差异补账失败 | 事务回滚无部分入账；差异保持待处理可重试 |
| 通知发送失败 | outbox 异步重试，不回滚资金事务（ADR-0010） |

## 8. 验收标准
1. 定时对账（日/周/月）与手动对账范围、并发锁校验正确（ref-4.4.5 §2）。
2. 差异量化分级（INFO/WARN/CRITICAL）与阈值、自动修复边界（补账/核销/误报/忽略）映射真实测试（supplement/02）。
3. 差异处理状态机流转正确；处理/复核职责分离（ADR-0004）。
4. 结算周期 `open→closed→settled`、结算单 `pending→settled`（含 3 天自动确认）、重复关账 409、调整校验（sprint-1/03）。
5. 禁负余额：补账/调整产生负返回受控错误，无负落库（ADR-0020）。
6. 精度：对账差额与补账 `numeric(18,8)`、输入 ≤2 位小数（ADR-0002）。
7. 幂等：对账/补账/核销/结算关账确认幂等，错误码固定（ADR-0009/0011）。
8. 2FA：补账/核销/结算调整未带有效操作 token 拒绝（ADR-0008）。
9. 审计/通知：差异处理与结算生成审计 + 分级通知，通知失败不影响结果（ADR-0010）。
10. 验收证据归属唯一发布基线 `docs/07-quality-and-acceptance/release-baseline.md`（ADR-0029）。

## 9. 页面与操作帮助

### [?] 页面帮助

- **适用角色**：财务人员、财务主管、超级管理员，以及代理商本人结算查看与确认。
- **功能定位**：运行资金对账、定位并处理差异、生成结算周期和结算单，保证平台、渠道与代理商账务一致。
- **核心操作**：运行对账、查看报告、处理差异、生成结算周期、调整结算金额、导出报告、确认代理结算。
- **注意事项**：同一范围的对账任务不可并发运行；补账和结算调整必须经过权限与 2FA 校验；已关账周期不可重复关账；代理只能确认本人结算单。
- **常见问题**：为什么对账任务被拒绝？为什么差异处理后仍需复核？为什么结算金额不能调整？为什么代理看不到其他代理的明细？

### [?] 按钮级帮助对照表

| 操作入口 | Tooltip 帮助文本 | 所需权限 | 可用状态 |
|---|---|---|---|
| 运行对账 | 按指定时间范围和类型生成一份新的对账报告 | `RECONCILIATION_VIEW` | 同范围没有运行中的任务 |
| 处理差异 | 根据平台与对方数据差异选择补账、核销、误报或忽略 | `FINANCE_COMMISSION` | 差异为 `pending` 或 `processing` |
| 生成结算周期 | 汇总指定周期的佣金并生成代理商结算单 | `settlement.generate` | 周期尚未关账 |
| 调整结算金额 | 在结算单仍为 `pending` 时提交有原因的金额调整 | `settlement.adjust` | `pending` 且通过 2FA |
| 确认结算 | 确认当前代理商本人结算单并转入可提现金额 | `settlement.confirm` | 本人结算单为 `pending` |
| 导出 | 导出当前报告或结算单明细，敏感字段按规则处理 | `RECONCILIATION_VIEW` | 有可导出的报告或结算单 |
