# 核心资金 SPEC

- 文档 ID：SPEC-BILLING-INDEX-001
- 状态：approved
- 生效版本：v1.0.0
- 定位：`03-functional-spec/03-billing-and-finance/` 目录索引（第一批核心资金功能规格/契约层）
- 权威依据：ADR-0018（文档集）、ADR-0019（命名/版本/状态）、`00-index/document-map.md`

## 目录定位

本目录承载**第一批核心资金功能规格（SPEC）层**。与 `02-requirements/03-billing-and-finance/`（PRD 层）一一对应，财务按 ADR-0018 拆分为 **充值、人工上账、调账、退款/红冲、结算/对账** 五个主题，每主题一份 SPEC，外加本 README（索引）与 `finance-overview.md`（跨主题功能规格总览）。

SPEC 是**功能契约层**：在对应 PRD 的需求之上，给出页面/路由、角色权限矩阵、字段与校验、状态机触发器、API 契约、事务/并发/异常、`[?]` 帮助对照、验收标准等可开发/可验收的实现契约。SPEC 不与 PRD/ADR 冲突；冲突处由 SPEC 显式标注并以 ADR/PRD 为准。

> 本 README 是索引/导航，不替代各主题 SPEC 与 `finance-overview.md`；功能契约正文以各主题 SPEC 为准。

## 主题 SPEC 一览

| 主题 | 文档 | 文档 ID | 状态 | 对应 PRD | 对应 API | 对应状态机 |
|---|---|---|---|---|---|---|
| 充值 | `recharge.md` | SPEC-BILLING-001 | approved | [PRD-BILLING-001](../../02-requirements/03-billing-and-finance/recharge.md) | [05-api/user/recharge.md](../../05-api/user/recharge.md) | [SM-BILLING-001](../../06-data-and-architecture/state-machines/recharge-order.md) |
| 人工上账 | `manual-topup.md` | SPEC-BILLING-002 | approved | [PRD-BILLING-002](../../02-requirements/03-billing-and-finance/manual-topup.md) | [05-api/admin/manual-topup.md](../../05-api/admin/manual-topup.md) | [SM-BILLING-002](../../06-data-and-architecture/state-machines/manual-topup.md) |
| 调账 | `balance-adjustment.md` | SPEC-BILLING-003 | approved | [PRD-BILLING-003](../../02-requirements/03-billing-and-finance/balance-adjustment.md) | [05-api/admin/finance.md](../../05-api/admin/finance.md) | [SM-BILLING-003](../../06-data-and-architecture/state-machines/adjustment.md) |
| 退款/红冲 | `refund-and-reversal.md` | SPEC-BILLING-004 | approved | [PRD-BILLING-004](../../02-requirements/03-billing-and-finance/refund-and-reversal.md) | [05-api/admin/finance.md](../../05-api/admin/finance.md) | [SM-BILLING-004](../../06-data-and-architecture/state-machines/refund.md) |
| 结算/对账 | `settlement-and-reconciliation.md` | SPEC-BILLING-005 | approved | [PRD-BILLING-005](../../02-requirements/03-billing-and-finance/settlement-and-reconciliation.md) | [05-api/admin/finance.md](../../05-api/admin/finance.md) | [SM-BILLING-005](../../06-data-and-architecture/state-machines/settlement.md) |

> 各 SPEC 上游 ADR 与事实来源在文档头部列明；契约冲突以 accepted ADR（ADR-0002/0003/0004/0008/0009/0011/0013/0020/0021/0022 等）为准。

## 读取顺序

1. 本索引（README）；
2. [`finance-overview.md`](finance-overview.md)——跨主题公共流程、通用验收门禁、跨主题一致性约束；
3. 主题 SPEC 建议顺序（与 PRD 依赖一致）：`recharge.md` → `manual-topup.md` → `balance-adjustment.md` → `refund-and-reversal.md` → `settlement-and-reconciliation.md`；
4. 每个主题 SPEC 内引用：对应 `02-requirements/…/*.md`（PRD）、`06-data-and-architecture/state-machines/*.md`（状态机）、`05-api/*`（API 契约）。

## 与其他目录的追溯

| 目录 | 与本目录关系 | 依据 |
|---|---|---|
| `02-requirements/03-billing-and-finance/` | 本目录 SPEC 的**上游需求来源**；SPEC 反向实现其 PRD | [PRD-BILLING-001..005](../../02-requirements/03-billing-and-finance/README.md) |
| `05-api/` | SPEC §API 契约引用的落地端点 | `05-api/user/recharge.md`、`05-api/admin/manual-topup.md`、`05-api/admin/finance.md` |
| `06-data-and-architecture/` | SPEC §状态机引用的权威状态机；权限/精度/事件/事务专章 | `06-data-and-architecture/state-machines/*.md` 等 |
| `07-quality-and-acceptance/` | 验收/发布基线；SPEC 验收标准归属唯一基线文件 | `release-baseline.md`（ADR-0029） |
| `08-operations-and-deployment/` | 迁移/部署/运维执行 | `migration-runbook.md`、`deployment-guide.md` |
| `09-decisions/ADR-*.md` | accepted 决策，SPEC 契约的事实依据 | ADR-0011 等 |

## 状态与治理

- 本目录五主题 SPEC 与 `finance-overview.md`、本 README 均为 `approved` v1.0.0；与对应 PRD 版本匹配。
- 新增/修改/删除文档须在 `00-index/document-inventory.md` 登记；状态变更遵循 ADR-0015、ADR-0019。
- P1 合规：每主题 SPEC §8/§9 含**定制** `[?] 页面帮助与按钮级帮助对照表`（非占位符），满足 `PRODUCT-DESIGN-PRINCIPLES` P1；缺失不得进入开发/验收。