# 结算与对账状态机

- 文档 ID：SM-BILLING-005
- 状态：approved
- 生效版本：v1.0.0
- 上游 ADR：ADR-0003、ADR-0004、ADR-0009、ADR-0010、ADR-0011、ADR-0012、ADR-0020
- 对应 PRD：`../../../02-requirements/03-billing-and-finance/settlement-and-reconciliation.md`
- 对应 SPEC：`../../../03-functional-spec/03-billing-and-finance/settlement-and-reconciliation.md`
- 事实来源：`docs/ref-4.4.5-reconciliation-prd.md`（§1.3、§2、§4.1、§5）、`docs/supplement/02-对账差异处理定量规则.md`（§三）、`docs/sprint-1/03-settlement-overview.md`（§1.3、§3）、`docs/flowcharts/05-auto-reconciliation.md`

## 0. 范围与规范依据

本状态机覆盖**结算与对账**主题下的三类业务对象生命周期：

1. **对账报告**（`reconciliation_reports`）：由对账引擎发起，记录一次对账比对及其状态。
2. **对账差异**（`reconciliation_mismatches`）：对账比对发现的差异项，由引擎创建，经财务处理/复核后关闭。
3. **代理结算周期与结算单**（`settlement_cycles` / `agent_settlements`）：按月关账、代理确认、管理员调整的结算过程。

**权威裁决（ADR-0012）**：本期`platform_ledger`不启用；对账/结算依据为 `customer_balances`、`balance_transactions`、业务单据和 `billing_logs`。涉及 `platform_ledger` 的"总账/结转/锁账"能力属架构预留，不在本状态机终态范围内。来源（ref-4.4.5/SPEC-§29）使用 `users.balance`/`balance_logs` 的口径已按 ADR-0006/0012 映射为 `customer_balances`/`balance_transactions`。

## 1. 状态定义

### 1.1 对账报告状态（ref-4.4.5 §4.1、§2.2）
| `status` | 含义 | 是否终态 | 说明 |
|---|---|---|---|
| `pending` | 已创建待执行 | 否 | 引擎创建 `reconciliation_reports` 记录 |
| `running` | 执行比对中 | 否 | 分类型比对、写差异、汇总 |
| `completed` | 已完成 | 是 | 写入差异明细、更新汇总、释放锁 |
| `failed` | 执行失败 | 是 | 超时/异常，可手动重跑受影响范围 |

### 1.2 对账差异状态（ref-4.4.5 §5.1 + supplement/02 §3.1 合并）
| `status` | 含义 | 是否终态 | 入口/处理 |
|---|---|---|---|
| `pending` | 待处理，引擎自动创建 | 否 | 对账引擎自动创建 |
| `processing` | 处理中，运营确认 | 否 | 人工标记，`FINANCE_COMMISSION` |
| `resolved` | 已修复（自动/手动） | 是 | 补账/核销完成后标记；须填处理备注 |
| `false_positive` | 误报（非真实差异） | 是 | 人工核实后标记 |
| `ignored` | 运营主动忽略 | 是 | 人工标记（note 注明 ignore） |

> 补充规格（supplement/02 §3.1）的细化解析态（`pending_auto`/`pending_review` 及 `resolved_as_platform_valid/vendor_valid/auto_match/price_change/duplicate/write_off`）可视为对 `pending → processing → resolved` 主链路的**处理备注细化**；落库主状态仍以本表为准，细化结果写入 `resolutionNote`。来源冲突处标注 `【待人工裁决】`（详见 §2 与 §8）。

### 1.3 代理结算周期状态（sprint-1/03 §1.3）
| `status` | 含义 | 是否终态 | 说明 |
|---|---|---|---|
| `open` | 周期已创建未关账 | 否 | 周期记录创建 |
| `closed` | 已关账，账单已生成待确认 | 否 | 关账后生成 `agent_settlements`（pending） |
| `settled` | 所有账单已结算 | 是 | 全部 `agent_settlements` 均 `settled` |

### 1.4 代理结算单状态（sprint-1/03 §1.3）
| `status` | 含义 | 是否终态 | 说明 |
|---|---|---|---|
| `pending` | 待代理确认 | 否 | 关账时创建；代理确认或 3 天自动确认 |
| `settled` | 已确认/已结算 | 是 | 金额转入代理可提现余额；管理员调整仅限 `pending` |

## 2. 转移矩阵

### 2.1 对账报告
| 当前状态 | 事件 | 下一状态 | 触发器 | 依据 |
|---|---|---|---|---|
| `pending` | 引擎开始比对 | `running` | `runAutoReconciliation()` 持锁后 | ref-4.4.5 §2.2 |
| `running` | 比对完成、写入差异 | `completed` | 汇总 + 写 `reconciliation_mismatches` + 更新 report | ref-4.4.5 §2.2 |
| `running` | 超时/异常 | `failed` | 单次超时 300s / 异常 | ref-4.4.5 §2.3 |
| `completed`/`failed` | 重跑 | （新报告 `pending`） | 手动触发，重新生成报告 | ref-4.4.5 §2.2 |

### 2.2 对账差异
```
                 ┌──────────────────────────────────────────────────┐
                 ▼                                                  │
pending(引擎创建) ──人工处理(pending_review 细化)──► processing      │
   │                                        │          │            │
   └── 自动修复(容差内) ──────────────────► resolved ◄──┴── 补账/核销完成
   └── 自动匹配/定价变更/重复/核销(auto_fix) ─► resolved
   └── 误报核实 ──► false_positive（终态）
   └── 运营忽略(note=ignore) ──► ignored（终态）
```

| 当前状态 | 事件 | 下一状态 | 触发器 | 依据 |
|---|---|---|---|---|
| `pending` | 自动修复成功（容差内） | `resolved` | 自动修复执行器 | ref-4.4.5 §5.1 |
| `pending` | 人工标记处理中 | `processing` | `FINANCE_COMMISSION` | ref-4.4.5 §5.1 |
| `processing` | 补账/核销完成 | `resolved` | 补账事务成功 + 处理人与复核人分离 | ref-4.4.5 §5.2、ADR-0004 |
| `pending`/`processing` | 核实为误报 | `false_positive` | 人工核实 | ref-4.4.5 §5.1 |
| `pending`/`processing` | 运营忽略 | `ignored` | note 注明 ignore | ref-4.4.5 §5.1 |
| `resolved`/`false_positive`/`ignored` | — | （终态） | 复核关闭 | ADR-0004 |

> 差异终态（`resolved`/`false_positive`/`ignored`）允许**复核人查看并确认关闭**；处理人与复核人不得同一人（ADR-0004）。`false_positive` 与 `ignored` 为去重后语义：误报=非真实差异，忽略=真实但运营主动暂不处理（`【待人工裁决】` 忽略项是否周期后重查）。

### 2.3 结算周期
| 当前状态 | 事件 | 下一状态 | 触发器 | 依据 |
|---|---|---|---|---|
| `open` | 关账（手动/自动） | `closed` | `generateSettlementCycle()` 批次写账单完成后 | sprint-1/03 §3.1 |
| `closed` | 全部结算单确认/自动确认 | `settled` | `checkSettleCycle()`（仅从 `closed→settled`） | sprint-1/03 §3.4 |
| `settled` | — | （终态） | — | — |

### 2.4 结算单
| 当前状态 | 事件 | 下一状态 | 触发器 | 依据 |
|---|---|---|---|---|
| `pending` | 代理手动确认 | `settled` | `POST /agent/settlements/:id/confirm` | sprint-1/03 §5.3 |
| `pending` | 3 天未确认系统自动确认 | `settled` | 每日 03:00 cron | sprint-1/03 §6.2 |
| `pending` | 管理员调整金额 | `pending`（金额更新） | `adjust`（仅 `pending`，禁负） | sprint-1/03 §3.3 |
| `settled` | — | （终态） | — | — |

## 3. 每个转移的副作用

| 转移 | 数据库操作 | 余额/资金 | 通知 / 审计 |
|---|---|---|---|
| 对账 `pending→running` | INSERT/更新 `reconciliation_reports`（status=running）；持分布式锁 | 不动余额 | 写审计 `recon.start` |
| 对账 `running→completed` | 写 `reconciliation_mismatches`（差异明细）+ 更新 report 汇总 + 释放锁 | 不动余额；仅记录差异 | 差异分级通知（critical→Webhook/财务主管、high→财务、medium→平台通知、low→仅报告，24h 去重）；写审计 `recon.complete` |
| 对账 `running→failed` | report 置 `failed` + `errorMessage`；释放锁 | 不动余额 | 写审计 `recon.fail`；触发重新调度 |
| 差异 `pending→resolved`（补账） | 事务：`UPDATE customer_balances`（原子，防负）→ `INSERT balance_transactions` → 更新差异 `resolved` → 写审计；任一失败回滚 | 余额变更（补退/补扣），禁负 | 资金变动触发站内有需求的通知；审计含处理人/复核人（ADR-0010/0004） |
| 差异 `→false_positive`/`→ignored` | 更新差异状态 + `resolutionNote` | 不动余额 | 写审计 `recon.resolve`/`recon.ignore` |
| 结算周期 `→closed` | 分批事务（50 代理/批）：汇总 settled 佣金 → 写 `agent_settlements`、`settlement_details`（100/批）、`settlement_confirm_logs(action=generate)`；最后周期置 closed | 不动余额（仅关账） | 写审计/日志 `generate` |
| 结算单 `→settled` | 事务：更新 `agent_settlements`(settled) → 代理可提现余额 `settledCommission += amount` → 写 `agent_balance_ledger(commission_settlement)` → 写 `settlement_confirm_logs(confirm/auto_confirm)` | 代理可提现余额增加 | 确认事件；审计 `confirm`/`auto_confirm` |
| 结算单调整 `→pending` | 更新 `adjustmentAmount/adjustmentReason/settledAmount`（禁负）+ 写 `settlement_confirm_logs(action=adjust)` | 代理可提现余额不变（结算前调整） | 写审计 `adjust`；调整原因对代理可见 |

> 通知时序（ADR-0010）：资金事务**提交成功后**写入 outbox/事件，再异步发送；通知失败不回滚资金事务；资金失败不得产生成功通知；重试不得造成重复可见通知。

## 4. 并发、幂等与状态守卫

- **对账任务并发锁**：同一 `(startDate,endDate,reconType)` 持 Redis 分布式锁 `recon:lock:{start}:{end}:{type}`（TTL 600s）；锁不可用返回 `503 IDEMPOTENCY_UNAVAILABLE`（ADR-0009 语义），不得静默绕过。超时 300s 置 failed。
- **差异补账状态守卫**：以 `WHERE status='pending'/'processing'` 原子更新，重复处理命中 0 行返回 `409 ORDER_ALREADY_PROCESSED`；余额更新防负（ADR-0020），余额不足回滚 `INSUFFICIENT_BALANCE`。
- **结算周期幂等**：`settlement_cycles(periodStart,periodEnd)` 唯一索引；重复关账（已 closed）返回 `409 CYCLE_ALREADY_CLOSED`。关账分批事务，失败批次整体回滚，周期保持可重跑。
- **结算确认幂等**：以 `WHERE status='pending'` 原子守卫转 `settled`；自动确认 cron 查 `status='pending'` 且 `created_at < NOW()-3天`，已 `settled` 不被查到（幂等）。
- **职责分离（ADR-0004）**：差异处理人 ≠ 复核人；结算调整操作人 ≠ 复核审批人；创建结算周期人 ≠ 复核人。
- Redis 仅作加速锁；DB 唯一约束、事务、状态守卫是最终边界（ADR-0009）。

## 5. 回滚与补偿

| 场景 | 补偿 |
|------|------|
| 对账报告执行中断/超时 | 报告置 `failed`/部分完成；手动重跑受影响时段（T+1 或指定范围） |
| 差异补账失败 | 事务回滚无部分入账；差异保持 `pending/processing` 可重试；不产生负余额 |
| 结算关账中断 | 已提交批次保留，失败批次回滚，批次边界幂等（50 代理/事务）；周期保持 `open/closed` 可重跑 |
| 结算确认中断 | 事务回滚；结算单保持 `pending`，可重新确认或自动确认 |
| 通知发送失败 | outbox 异步重试，不回滚资金事务（ADR-0010） |

## 6. 审计与通知
- **差异分级告警（ref-4.4.5 §5.4）**：`critical` → 平台告警 + Webhook（钉钉/飞书）→ 财务主管；`high` → 平台告警 → 财务（当日）；`medium` → 平台通知（本周）；`low` → 仅报告。同类型同用户差异 24h 内不重复告警。
- **资金变动强制站内通知（ADR-0010）**：补账（补退/补扣）若产生用户余额变动，遵循资金类站内通知强制发送；Email/SMS/Webhook 按偏好。
- **审计**：对账运行、差异处理、结算关账/确认/调整均写操作审计/日志（操作人、前后值、生效时间、原因）；审批/复核人单独记录（ADR-0004）。
- **事件字段（ADR-0010）**：event_id、event_type、aggregate、user、amount、currency、occurred_at、idempotency_key；通知状态 `queued/sent/failed/skipped` 支持查询、重试、补发。
- **测试基线（ADR-0029）**：本状态机验收证据归属唯一发布基线 `docs/07-quality-and-acceptance/release-baseline.md`；不得用历史数字（1159/1132/808）宣称基线。

## 7. 测试映射

> 已建立真实测试优先级映射，依据来源：ref-4.4.5、supplement/02、sprint-1/03、flowcharts/05；正式自动化工程落地前，用例来源为上述规格文档。

| 测试意图 | 真实用例（来源） | 期望结果 |
|---|---|---|
| 定时对账调度 | ref-4.4.5 §2.1（daily/weekly/monthly） | 按表达式触发，生成 `reconciliation_reports` |
| 对账并发锁 | ref-4.4.5 §2.2/2.3（Redis 锁） | 同一范围并行请求被锁拦截；锁不可用 → 503 |
| 对账超时/熔断 | ref-4.4.5 §2.3（超时 300s、500 条截断） | 超时置 failed；差异>500 截断并告警 |
| 差异自动修复（容差内） | ref-4.4.5 §5.1 + supplement/02 §二（≤¥1 自动核销/补账） | `pending→resolved` 且写 `balance_transactions` 补账禁负 |
| 差异人工处理流转 | ref-4.4.5 §5.1 + supplement/02 §三 | `pending→processing→resolved/false_positive/ignored` 状态正确；终态复核关闭 |
| 差异职责分离 | ADR-0004 | 处理人与复核人同一时拒绝（403/409） |
| 补账防负 | ADR-0020 + supplement/02 §七 | 余额不足返回 `INSUFFICIENT_BALANCE`，无负落库 |
| 结算周期幂等关账 | sprint-1/03 §3.1/§6.1 | 唯一索引；重复关账 `409 CYCLE_ALREADY_CLOSED` |
| 结算确认/自动确认 | sprint-1/03 §3.2/§6.2 | `pending→settled`，可提现余额增加；3 天自动确认幂等 |
| 结算调整校验 | sprint-1/03 §3.3 | 仅 pending 可调；原因 5–500 字；禁负 `SETTLEMENT_AMOUNT_NEGATIVE` |
| 通知分级/去重 | ref-4.4.5 §5.4 | critical/high/medium/low 分级通知；24h 同类型同用户去重 |
| 幂等/固定错误码 | ADR-0009/0011 + sprint-1/03 §7 | 同 Key 重放首结果、异摘要 409、重复业务引用固定错误码 |

> 待补真实映射（后续自动化工程建立）：对账差异细化解析态（`pending_auto`/`pending_review` 及各 `resolved_as_*`）与主状态的序列化正确性、结算周期 366 天跨度与批次边界、异步长任务接口形态。

## 8. 数据模型要点与裁决边界
- 对账报告/差异复用 `reconciliation_reports` / `reconciliation_mismatches` 表（ref-4.4.5 §4.1）；差异处理字段 `status/resolutionNote/resolvedBy/resolvedAt` 为需新增能力（历史仅 `resolved boolean`，见 ref-4.4.5 附录）。
- 结算复用 `settlement_cycles` / `agent_settlements` / `settlement_details` / `settlement_confirm_logs`（sprint-1/03 §2）；精度：结算金额 `numeric(18,4)`、明细佣金 `numeric(18,8)`。
- **余额与补账**：以 `customer_balances` / `balance_transactions` 为准（ADR-0006/0012）；`platform_ledger` 本期不写。
- **裁决边界（`【待人工裁决】`）**：
  1. supplement/02 §3.1 细化解析态与主状态表在落库层的映射方式。
  2. `ignored` 差异是否周期结束后重查。
  3. `false_positive` 与 `ignored` 去重后的复核关闭是否需要独立复核记录。
## [?] 页面帮助定位

> 本文档为状态机专章（非 UI 页面），不定义独立页标题或操作按钮的 [?] 帮助；其对应页面（[?] 页面帮助与按钮级帮助对照表）定义于本状态机所属主题  3-functional-spec/03-billing-and-finance 对应 SPEC 的 §[?] 页面帮助章节。

