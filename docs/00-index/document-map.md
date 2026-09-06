# 第一批文档地图

- 文档 ID：INDEX-MAP-BILLING-001
- 状态：review
- 生效版本：v0.1.0
- 建立日期：2026-08-29
- owner：dispatch-agent（地图维护）；主题 owner 见各主题文档
- source_of_truth：[`governance-policy.md`](governance-policy.md) 与 [`document-inventory.md`](document-inventory.md)

> 交付包完整性以 [`feature-package-matrix.md`](feature-package-matrix.md) 为追踪视图；本地图不表示五大资金主题已获业务批准。
>
> ADR-0030 已 accepted；错误码、分页、结算/对账权限及 `platform_ledger` 范围以 [`../09-decisions/ADR-0030-four-contract-rulings.md`](../09-decisions/ADR-0030-four-contract-rulings.md) 为准，代码/测试差距仍单独跟踪。
>
> 新正式章节尚未完成正文拆分。下表先登记目标文件、主权威来源和当前状态；冲突来源不得直接并入 approved 正文。

| 主题 | 目标 PRD | 目标 SPEC | 目标 ARCH/数据 | 目标 API | 目标 TEST/OPS | 主权威来源 | 当前状态 |
|---|---|---|---|---|---|---|---|
| 充值 | `02-requirements/03-billing-and-finance/recharge.md` | `03-functional-spec/03-billing-and-finance/recharge.md` | `06-data-and-architecture/state-machines/recharge-order.md` | `05-api/user/recharge.md` + `05-api/admin/manual-topup.md` | [`07-quality-and-acceptance/finance-test-package.md`](../07-quality-and-acceptance/finance-test-package.md)（review） / [`08-operations-and-deployment/finance-ops-package.md`](../08-operations-and-deployment/finance-ops-package.md)（review） | `docs/PRD-整改R1-R4-人工上账与资金入账.md` | PRD/SPEC/SM/API review；TEST review；OPS review，未准入 |
| 人工上账 | `02-requirements/03-billing-and-finance/manual-topup.md` | `03-functional-spec/03-billing-and-finance/manual-topup.md` | `06-data-and-architecture/state-machines/manual-topup.md` | `05-api/admin/manual-topup.md` | [`07-quality-and-acceptance/finance-test-package.md`](../07-quality-and-acceptance/finance-test-package.md)（review） / [`08-operations-and-deployment/finance-ops-package.md`](../08-operations-and-deployment/finance-ops-package.md)（review） | `docs/PRD-整改R1-R4-人工上账与资金入账.md` | PRD/SPEC/SM/API review；TEST review；OPS review，未准入 |
| 调账 | `02-requirements/03-billing-and-finance/balance-adjustment.md` | `03-functional-spec/03-billing-and-finance/balance-adjustment.md` | `06-data-and-architecture/state-machines/adjustment.md` | `05-api/admin/balance-adjustment.md` | [`07-quality-and-acceptance/finance-test-package.md`](../07-quality-and-acceptance/finance-test-package.md)（review） / [`08-operations-and-deployment/finance-ops-package.md`](../08-operations-and-deployment/finance-ops-package.md)（review） | `docs/PRD-整改R5-R7-资金风控.md` | PRD/SPEC/SM/API review；TEST review；OPS review，未准入 |
| 退款/红冲 | `02-requirements/03-billing-and-finance/refund-and-reversal.md` | `03-functional-spec/03-billing-and-finance/refund-and-reversal.md` | `06-data-and-architecture/state-machines/refund.md` | `05-api/admin/refund-and-reversal.md` | [`07-quality-and-acceptance/finance-test-package.md`](../07-quality-and-acceptance/finance-test-package.md)（review） / [`08-operations-and-deployment/finance-ops-package.md`](../08-operations-and-deployment/finance-ops-package.md)（review） | `docs/ref-4.4-finance.md` + ADR-0003/0020 | PRD/SPEC/SM/API review；TEST review；OPS review，未准入 |
| 结算/对账 | `02-requirements/03-billing-and-finance/settlement-and-reconciliation.md` | `03-functional-spec/03-billing-and-finance/settlement-and-reconciliation.md` | `06-data-and-architecture/transaction-and-concurrency.md` + `state-machines/settlement.md` | `05-api/admin/settlement-and-reconciliation.md` | [`07-quality-and-acceptance/finance-test-package.md`](../07-quality-and-acceptance/finance-test-package.md)（review） / [`08-operations-and-deployment/finance-ops-package.md`](../08-operations-and-deployment/finance-ops-package.md)（review） | `docs/ref-4.4.5-reconciliation-prd.md` | PRD/SPEC/SM/API review；TEST review；OPS review，冲突未关闭 |
| 精度 | 资金章节引用 | 资金 SPEC 引用 | `06-data-and-architecture/billing-and-money-precision.md` | API conventions 引用 | 测试专章引用 | ADR-0002 | accepted / 正文待同步 |
| 权限 | `02-requirements/07-compliance-and-integrations/permissions.md` | 权限 SPEC | `06-data-and-architecture/permissions-and-authorization.md` | `05-api/admin/permissions.md` | 权限测试 | ADR-0004 | accepted / 正文待同步 |
| 幂等/错误码 | 资金章节引用 | 资金 SPEC 引用 | 事务专章引用 | `05-api/idempotency.md`、`errors.md` | 契约测试 | ADR-0009、ADR-0011 | accepted / 正文待同步 |
| 通知 | 资金章节引用 | 通知 SPEC | `06-data-and-architecture/event-and-notification.md` | 通知 API | 通知测试/OPS | ADR-0010 | accepted / 正文待同步 |
| 迁移/发布 | 非 PRD | 发布 SPEC 引用 | `06-data-and-architecture/migration-design.md` | 管理 API 仅列实际存在者 | `07-quality-and-acceptance/release-gate.md`、`08-operations-and-deployment/` | ADR-0007、ADR-0014 | accepted / 正文待同步 |

---

## 用户体系正式需求（2026-08-31，review，不可准入）

| 类别 | 文档 | 状态 | 处理 |
|---|---|---|---|
| 用户体系 PRD | `02-requirements/02-user-system/README.md` | review | 用户体系需求包唯一入口 |
| 用户体系 PRD | `02-requirements/02-user-system/PRD-用户体系-v1.0.0-review.md` | review | 恢复后的高层 PRD；不得作为开发/验收依据 |
| 恢复裁决 | `_recovered/PRD-用户体系-recovery-decision-2026-08-31.md` | review | 逐项裁决、废弃项与 blocked 清单 |

## 补充/细化/恢复文档（2026-08-30 纳入治理）

> 全量现役清单以 [`document-inventory.md`](document-inventory.md) 为准。下列文档在 `document-map` 登记其来源/状态，消除"S悬空"问题；评审前为 `draft` 来源资料。

| 类别 | 文档 | 补充/细化对象 | 状态 | 处理 |
|---|---|---|---|---|
| 补充规格 | `supplement/01-计费引擎状态机.md` | ref-5.2-billing | draft | 纳入计费模块评审 |
| 补充规格 | `supplement/02-对账差异处理定量规则.md` | SPEC-§29.3 | draft | 纳入对账模块评审 |
| 补充规格 | `supplement/03-充值退款状态机.md` | ref-2.2.6-recharge、ref-9.5-refund | draft | 纳入充值/退款评审 |
| 补充规格 | `supplement/04-代理佣金与结算.md` | ref-3-agent-system | draft | 纳入代理商体系评审 |
| 补充规格 | `supplement/05-路由熔断恢复梯度.md` | ref-5.1-routing | draft | 纳入路由模块评审 |
| 补充规格 | `supplement/06-全链路一致性契约.md` | 各模块一致性 | draft | 纳入全局一致性评审 |
| 补充规格 | `supplement/07-Schema重设计建议.md` | 库表重设计 | draft（P1） | 纳入数据评审 |
| 补充规格 | `supplement/08-系统状态机总图.md` | 全局状态机 | draft | 纳入全局评审 |
| 补充规格 | `supplement/09-遗漏补丁.md` | 补丁→01/04 等 | draft | 逐条归属登记 |
| Sprint | `sprint-1/SPEC-充值中心.md` 等 | 账号注销/结算对账/充值中心 | 迭代管理 | 项目迭代跟踪 |
| 恢复草稿 | `_recovered/PRD-用户体系-recovered-draft.md` | 用户体系 PRD | 临时 | 人工裁决 NEEDS-MANUAL-RECOVERY 后升格 |

> ⚠️ `_recovered/` 自证非 canonical 需求源；恢复并经人工裁决前，用户体系 PRD 的 610 行 `NEEDS-MANUAL-RECOVERY` 不做验收结论。
