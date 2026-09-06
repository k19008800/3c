# 核心资金 PRD

- 文档 ID：PRD-BILLING-INDEX-001
- 状态：approved
- 生效版本：v1.0.0
- 定位：`02-requirements/03-billing-and-finance/` 目录索引（第一批核心资金 PRD 层）
- 权威依据：`00-index/document-map.md`、`00-index/document-inventory.md`、ADR-0018（文档集）、ADR-0019（命名/版本/状态）

## 目录定位

本目录承载**第一批核心资金需求（PRD）层**。对应 ADR-0018：财务按业务对象拆分为 **充值、人工上账、调账、退款/红冲、结算/对账** 五个主题，每个主题一份 PRD（`<主题>.md`），另有本索引（`README.md`）与跨主题总览（`finance-overview.md`）。

权威层（ADR-0018 / `00-index/README.md`）：`ADR → PRD → SPEC → ARCH → API → TEST → OPS`。本目录文档为 `PRD` 层，是 `03-functional-spec/03-billing-and-finance/` 各 SPEC 的上游需求依据；只有 `approved` 文档可作为开发与验收依据。

> 本 README 是**索引/导航**文档，不定义具体业务规则、不替代各主题 PRD 与 `finance-overview.md`；具体规则以五个主题 PRD 与 `finance-overview.md` 汇总为准。

## 主题 PRD 一览

| 主题 | 文档 | 文档 ID | 状态 | 主权威来源 | 对应 SPEC | 对应状态机 | API |
|---|---|---|---|---|---|---|---|
| 充值 | `recharge.md` | PRD-BILLING-001 | approved | `docs/PRD-整改R1-R4-人工上账与资金入账.md`、`docs/ref-2.2.6-recharge.md`、`docs/sprint-1/SPEC-充值中心.md` | [SPEC-BILLING-001](../../03-functional-spec/03-billing-and-finance/recharge.md) | [SM-BILLING-001](../../06-data-and-architecture/state-machines/recharge-order.md) | [05-api/user/recharge.md](../../05-api/user/recharge.md) |
| 人工上账 | `manual-topup.md` | PRD-BILLING-002 | approved | `docs/PRD-整改R1-R4-人工上账与资金入账.md`、`docs/ARCH-整改R1-R4-技术方案.md`、`docs/supplement/03-充值退款状态机.md` | [SPEC-BILLING-002](../../03-functional-spec/03-billing-and-finance/manual-topup.md) | [SM-BILLING-002](../../06-data-and-architecture/state-machines/manual-topup.md) | [05-api/admin/finance.md](../../05-api/admin/finance.md) |
| 调账 | `balance-adjustment.md` | PRD-BILLING-003 | approved | `docs/PRD-整改R5-R7-资金风控.md`、`docs/ARCH-整改R5-R7-资金风控.md` | [SPEC-BILLING-003](../../03-functional-spec/03-billing-and-finance/balance-adjustment.md) | [SM-BILLING-003](../../06-data-and-architecture/state-machines/adjustment.md) | [05-api/admin/finance.md](../../05-api/admin/finance.md) |
| 退款/红冲 | `refund-and-reversal.md` | PRD-BILLING-004 | approved | `docs/ref-4.4-finance.md` §4、`docs/ref-9.5-refund.md`、`docs/supplement/03-充值退款状态机.md` | [SPEC-BILLING-004](../../03-functional-spec/03-billing-and-finance/refund-and-reversal.md) | [SM-BILLING-004](../../06-data-and-architecture/state-machines/refund.md) | [05-api/admin/finance.md](../../05-api/admin/finance.md) |
| 结算/对账 | `settlement-and-reconciliation.md` | PRD-BILLING-005 | approved | `docs/ref-4.4.5-reconciliation-prd.md`、`docs/SPEC-§29-资金与对账管理.md`、`docs/supplement/02-对账差异处理定量规则.md`、`docs/sprint-1/03-settlement-overview.md`、`docs/sprint-1/04-settlement-frontend.md` | [SPEC-BILLING-005](../../03-functional-spec/03-billing-and-finance/settlement-and-reconciliation.md) | [SM-BILLING-005](../../06-data-and-architecture/state-machines/settlement.md) | [05-api/admin/finance.md](../../05-api/admin/finance.md) |

> 五主题依赖上游 ADR（ADR-0001–0004、0006、0008–0013、0020–0024、0029 等），各 PRD 头部已列明；冲突以 accepted ADR 为准（ADR-0017）。

## 读取顺序

1. 本索引（README）；
2. [`finance-overview.md`](finance-overview.md)——《核心资金域总览》：资金域全景、主题摘要、依赖顺序、资金流向图、金额上限与错误码汇总、P1 帮助落地说明；
3. 主题 PRD 建议按如下顺序阅读（依赖方向）：
   - 充值 `recharge.md` → 人工上账 `manual-topup.md`（二者共享 `recharge_orders` 表与同一入账语义，ADR-0003）；
   - 调账 `balance-adjustment.md`（复用人工上账的 24h 限额、分级审批与 2FA 体系）；
   - 退款/红冲 `refund-and-reversal.md`（消费退余额 / 充值原路退款 / 调账纠错走红冲，ADR-0020）；
   - 结算/对账 `settlement-and-reconciliation.md`（对账引擎 + 代理结算，依赖前四主题的资金链路）；
4. 各主题 PRD 内的状态机引用对应 `06-data-and-architecture/state-machines/*.md`；API 契约引用对应 `05-api/*`。

## 与其他目录的追溯

| 目录 | 与本目录关系 | 依据 |
|---|---|---|
| `00-index/` | 文档地图/清单/未决/术语/决策登记；本目录 PRD 的准入登记与未决引用 | `document-map.md`、`document-inventory.md`、`open-issues.md` |
| `03-functional-spec/03-billing-and-finance/` | 每个主题 PRD 的**功能规约层（下游）**，SPEC 反向引用本目录 | [SPEC-BILLING-001..005](../../03-functional-spec/03-billing-and-finance/README.md) |
| `05-api/` | 每个主题 PRD 的**API 契约（下游）** | `05-api/user/recharge.md`、`05-api/admin/finance.md` |
| `06-data-and-architecture/` | 状态机/账本/精度/权限/事件/事务/迁移专章；本目录 PRD 引用其状态机 | `06-data-and-architecture/state-machines/*.md`、`billing-and-money-precision.md`、`permissions-and-authorization.md`、`event-and-notification.md`、`migration-design.md` |
| `07-quality-and-acceptance/` | 验收/发布基线；验收证据归属唯一基线文件 | `release-baseline.md`（ADR-0029） |
| `08-operations-and-deployment/` | 迁移/部署/运维执行 | `migration-runbook.md`、`deployment-guide.md` |
| `09-decisions/ADR-*.md` | accepted 决策，本目录 PRD 的事实依据 | ADR-0001 等 |

## 状态与治理

- 本目录五主题 PRD 与 `finance-overview.md`、本 README 均为 `approved` v1.0.0；对应的 `03-functional-spec/…` 同步 approved。
- 新增/修改/删除文档须在 `00-index/document-inventory.md` 登记；状态变更遵循 ADR-0015、ADR-0019。
- 未决事项引用 `00-index/open-issues.md`（仅引用已解决项或已登记待办）；未解项标 `【待人工裁决】`，不据此伪造规则。