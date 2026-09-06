# 数据与架构入口

- 文档 ID：ARCH-INDEX-001
- 状态：approved
- 生效版本：v1.0.0
- 权威依据：`00-index/document-map.md`、`00-index/document-inventory.md`、ADR-0018（文档集）
- 定位：`06-data-and-architecture/` 目录索引（第一批核心资金数据与架构层）

## 目录定位

本目录承载核心资金第一批的**数据与架构专章**：状态机、账本、精度、权限、事件、事务、迁移设计。本目录文档是 `05-api` 的上游数据/架构依据，为 `03-functional-spec`/`02-requirements` 的数据契约提供事实来源。

## 文件清单

| 文件 | 文档 ID | 状态 | 内容 |
|---|---|---|---|
| `billing-and-money-precision.md` | ARCH-BILLING-001 | approved | 金额精度/舍入/尾差/对账口径（ADR-0002） |
| `data-dictionary.md` | ARCH-BILLING-002 | approved | 核心资金表数据字典（schema 实测） |
| `permissions-and-authorization.md` | ARCH-BILLING-003 | approved | 权限点矩阵/职责分离/操作级 2FA（ADR-0004/0024/0008） |
| `event-and-notification.md` | ARCH-BILLING-004 | approved | 资金事件/通知 outbox（ADR-0010） |
| `migration-design.md` | ARCH-BILLING-005 | approved | 迁移体系/回滚/备份恢复（ADR-0007/0026/0028） |
| `transaction-and-concurrency.md` | ARCH-BILLING-006 | approved | 交易/并发/隔离/补偿（含结算对账） |
| `state-machines/` | SM-* | approved | 充值/人工上账/调账/退款/结算 5 状态机 |

> 各 ARCH 专章"页面级 `[?]` 帮助"因非 UI 页面不在此定义，统一指向对应 `03-functional-spec` 的 `[?] 页面帮助与按钮级对照表`（见各 SPEC §8）。

## 与其它目录追溯

| 目录 | 关系 |
|---|---|
| `00-index/` | 文档地图/清单/未决/决策登记 |
| `02-requirements/` 与 `03-functional-spec/` | 各主题 PRD/SPEC 引用本目录状态机与专章 |
| `05-api/` | API 契约引用精度/幂等/事务语义 |
| `07-quality-and-acceptance/` / `08-operations-and-deployment/` | 测试映射/迁移 runbook/发布基线 |

新增/修改文档在 `00-index/document-inventory.md` 登记；状态变更遵循 ADR-0015/0019。