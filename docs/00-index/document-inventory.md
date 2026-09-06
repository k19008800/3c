# 当前文档清单（Document Inventory）

- 文档 ID：INDEX-INVENTORY-001
- 状态：review
- 生效版本：v1.0.0
- 建立日期：2026-08-30
- **用途**：全库"哪些文档现役、处于何种状态、属哪个权威层级"的唯一登记表。任何新文档须先在此登记，删除/归档须在此标注替代关系。

> 权限裁定：本清单与 `document-map.md` 同属 `00-index/README.md` 的准入实体。只有登记为 `approved`/`accepted` 的文档可作为开发与验收依据。

## 目录定位速查

| 目录 | 定位 | 状态 | 备注 |
|---|---|---|---|
| `00-index/` | 准入入口 + 清单/地图/术语/决策/未决 | review | 本清单即属此类 |
| `00-index/completeness-checklist.md` | 需求完整性核对规范（可复用） | approved（治理） | 开发准入判定依据 |
| `02-requirements/` | 核心资金 PRD（含索引/总览） | **review** | 五主题正文已形成可审阅版本；TEST/OPS 与联合评审未完成，不得准入 |
| `03-functional-spec/` | 核心资金 SPEC（含索引/总览） | **review** | 五主题正文已形成可审阅版本；帮助、TEST/OPS 与联合评审未完全闭环，不得准入 |
| `05-api/` | API 契约（含支撑契约 + 主题契约） | **approved** | 支撑契约 + 主题契约已 approve |
| `06-data-and-architecture/` | 状态机/权限/数据 | **approved** | 状态机 + 5 专章 + 事务专章已 approve |
| `07-quality-and-acceptance/` | 验收/发布基线 | draft | 未通过，待补证据 |
| `08-operations-and-deployment/` | 部署/迁移/运维 | review | 已建立五大资金主题 OPS 交付包；真实发布/迁移/恢复/回滚演练证据待补 |
| `09-decisions/ADR-*.md` | 决策 | **accepted** | 可直接作依据 |
| `supplement/` | 重写前补充规格 | draft 来源 | 本轮纳入治理（见下） |
| `sprint-1/` | Sprint 细化 | 项目迭代管理 | 本轮纳入治理 |
| `_recovered/` | 恢复草稿 | 临时工作区 | 非 canonical，需人工裁决 |
| `docs/` 根目录 `PRD-*.md`/`ref-*.md`/`SPEC-*.md` | 既有来源资料 | 来源，待迁移 | 未 approve |

---

## 治理文档（本入口的规则与追踪视图）

| 文档 | 文档 ID | 状态 | 定位 | owner | source_of_truth |
|---|---|---|---|---|---|
| `00-index/governance-policy.md` | GOV-CORE-001 | review | 唯一入口、状态机、元数据、变更控制与开发准入规则 | dispatch-agent | `00-index/README.md` |
| `00-index/feature-package-matrix.md` | INDEX-PACKAGE-BILLING-001 | review | 十四个核心主题 ADR→PRD→SPEC→状态机→权限/数据→API→TEST→OPS 状态、业务裁决、证据与 owner 追踪 | dispatch-agent | `00-index/governance-policy.md`、`document-inventory.md`、`decision-register.md` |
| `00-index/governance-scan-report.md` | GOV-SCAN-20260831-001 | review | 全库文档治理一致性扫描、状态统计、验证结果与失败原因 | dispatch-agent | `00-index/governance-policy.md`、`document-inventory.md`、`document-map.md` |

> 上述治理文档本身不批准任何业务主题；矩阵中的 `approved` 是单文档登记状态，不代表整包准入。

## 一、决策文档（accepted，可直接依据）

见 [`decision-register.md`](decision-register.md)：ADR-0001 … ADR-0030 全部 `accepted`。

| 文档 | 文档 ID | 状态 | 定位 |
|---|---|---|---|
| `09-decisions/ADR-0030-four-contract-rulings.md` | ADR-0030 | accepted | 四项业务契约冻结：错误码、分页、结算/对账权限与 `platform_ledger` 范围 |

## 二、第一批核心资金主题追溯

### 2.1 主题 PRD / SPEC 登记（review，不可作为开发依据）

充值、人工上账、调账、退款/红冲、结算/对账五主题的 PRD 与对应 SPEC 均已形成 `review` v1.0.0：PRD-BILLING-001..005 → `02-requirements/03-billing-and-finance/{recharge,manual-topup,balance-adjustment,refund-and-reversal,settlement-and-reconciliation}.md`；SPEC-BILLING-001..005 → 对应 `03-functional-spec/03-billing-and-finance/*.md`；状态机 SM-BILLING-001..005 → `06-data-and-architecture/state-machines/*.md`。主权威来源登记见 [`document-map.md`](document-map.md)。

### 2.2 本批次索引 / 总览文档登记（已 approved v1.0.0）

| 文档 | 文档 ID | 目录 | 状态 | 定位 |
|---|---|---|---|---|
| `02-requirements/03-billing-and-finance/README.md` | PRD-BILLING-INDEX-001 | 02-requirements | approved | 核心资金 PRD 目录索引 |
| `02-requirements/03-billing-and-finance/finance-overview.md` | PRD-BILLING-000 | 02-requirements | approved | 核心资金需求总览（资金域全景/金额与错误码汇总/P1 帮助落地） |
| `03-functional-spec/03-billing-and-finance/README.md` | SPEC-BILLING-INDEX-001 | 03-functional-spec | approved | 核心资金 SPEC 目录索引 |
| `03-functional-spec/03-billing-and-finance/finance-overview.md` | SPEC-BILLING-000 | 03-functional-spec | approved | 核心资金功能规格总览（公共流程/验收门禁/一致性约束） |

> 索引/总览文档只作导航与汇总（ADR-0018），不替代各主题 PRD/SPEC 的具体正文。同步登记：`docs/00-index/open-issues.md` 新增第 14 项（充值主题真实测试映射差额待办）。

### 2.3 数据/API 契约专章登记（2026-08-31 approved v1.0.0）

| 文档 | 文档 ID | 目录 | 状态 | 定位 |
|---|---|---|---|---|
| `07-quality-and-acceptance/finance-test-package.md` | TEST-BILLING-FIVE-THEMES-001 | 07-quality-and-acceptance | review | 五大资金主题需求→测试→证据追溯矩阵；37 个唯一 TEST/AC ID，未执行项如实标记 | owner=test-agent；source_of_truth=五主题 SPEC、acceptance-criteria.md、governance-policy.md |
| `05-api/conventions.md` | API-CORE-001 | 05-api | approved | API 统一约定（两表面/响应 envelope/认证/幂等/金额序列化） |
| `05-api/errors.md` | API-CORE-002 | 05-api | approved | 平台业务 API 错误码字典（ADR-0030：兼容消费 `PAYMENT_REQUIRED`=402、平台资金 `INSUFFICIENT_BALANCE`=422） |
| `05-api/idempotency.md` | API-BILLING-001 | 05-api | approved | 资金幂等规范（ADR-0009，禁降级） |
| `05-api/README.md` | API-INDEX-001 | 05-api | approved | 05-api 目录索引 |
| `05-api/user/recharge.md` | API-BILLING-USER-RECHARGE | 05-api | approved | 用户自助充值契约（D-04 拆分自原 API-BILLING-002） |
| `05-api/admin/manual-topup.md` | API-BILLING-MANUAL-TOPUP | 05-api | approved | 管理端人工上账契约（D-04 拆分自原 API-BILLING-002） |
| `06-data-and-architecture/billing-and-money-precision.md` | ARCH-BILLING-001 | 06 | approved | 金额精度/舍入/尾差/对账口径 |
| `06-data-and-architecture/data-dictionary.md` | ARCH-BILLING-002 | 06 | approved | 核心资金表数据字典（schema 实测） |
| `06-data-and-architecture/permissions-and-authorization.md` | ARCH-BILLING-003 | 06 | approved | ADR-0030 最终权限点矩阵/职责分离/操作级 2FA |
| `06-data-and-architecture/event-and-notification.md` | ARCH-BILLING-004 | 06 | approved | 资金事件/通知 outbox |
| `06-data-and-architecture/migration-design.md` | ARCH-BILLING-005 | 06 | approved | 迁移体系/回滚/备份恢复 |
| `06-data-and-architecture/README.md` | ARCH-INDEX-001 | 06 | approved | 06 目录索引 |

> 各 ARCH/状态机专章不定义独立 `[?]` 帮助（非 UI 页面），[`?`] 页面/按钮帮助统一指向对应 `03-functional-spec` 的 §`[?]` 页面帮助章节。
> 已知登记：~~`05-api/README.md` §三 的文档 ID 冲突（`user/recharge.md` 与 `admin/manual-topup.md` 均 `API-BILLING-002`）~~ **已裁决（D-04，2026-09）**，现为 `API-BILLING-USER-RECHARGE` / `API-BILLING-MANUAL-TOPUP`；`errors.md` §4 的实现差异见 `00-index/open-issues.md`。

## 三、历史计划、旧契约与整改验证登记

| 文档 | 状态 | 定位 | 权威边界 |
|---|---|---|---|
| `iteration-plan-v1.md` | historical snapshot | 2026-07-30 差距盘点与迭代计划 | 不作为当前发布依据 |
| `iteration-plan-v2.md` | historical execution plan | 2026-08-17 P0–P3 计划与当时基线 | 迭代完成不等于 production ready；以当前 release baseline 为准 |
| `api-contract.md` | historical / migration reference | 2026-08 前端端点对齐记录 | 非 canonical；现行契约在 `05-api/` |
| `07-quality-and-acceptance/remediation-verification-report-2026-09.md` | review evidence record | 本轮规则同步、编码扫描、测试与阻断记录 | 只登记实际结果，不单独授予准入 |

## 四、补充规格（supplement 01–09）

> 定位见 `supplement/00-README-补充说明.md`：为"重写直接可开发不踩坑"补全规格。本清单登记其补充对象与状态，消除"S无归属"问题；评审前为 `draft` 来源资料，不单独作为验收依据。

| 编号 | 文件 | 补充对象 | 状态 | 归属模块 |
|---|---|---|---|---|
| 01 | `supplement/01-计费引擎状态机.md` | ref-5.2-billing.md | draft | 计费引擎 |
| 02 | `supplement/02-对账差异处理定量规则.md` | SPEC-§29 资金与对账 29.3 | draft | 对账 |
| 03 | `supplement/03-充值退款状态机.md` | ref-2.2.6-recharge、ref-9.5-refund | draft | 充值/退款 |
| 04 | `supplement/04-代理佣金与结算.md` | ref-3-agent-system、PRD-代理商体系-后台主导版 | draft | 代理商体系 |
| 05 | `supplement/05-路由熔断恢复梯度.md` | ref-5.1-routing.md | draft | 路由/熔断 |
| 06 | `supplement/06-全链路一致性契约.md` | 各模块数据一致性（无单点来源） | draft | 全局一致性 |
| 07 | `supplement/07-Schema重设计建议.md` | 基于 01–06 库表重设计 | draft（P1） | 数据/Schema |
| 08 | `supplement/08-系统状态机总图.md` | 全局状态机汇总 | draft | 全局 |
| 09 | `supplement/09-遗漏补丁.md` | 补丁 A→01、B→04（及其他） | draft | 按补丁所属 |

> **待办**：secret 09 的补丁 A/B/C/D 归属逐条核对并登记到 `01`/`04` 等目标文档；评审大会通过后升为对应正式 SPEC 章节或标注 `superseded`。

## 四、Sprint 细化（sprint-1/）

> 由项目迭代管理，已纳入权威清单备案。文件：`README.md`（索引）、`01-account-deletion-*.md`、`02-…`、`03-settlement-*.md`、`04-…`、`05-boundary-conditions.md`、`SPEC-充值中心.md`。

| 文件 | 定位 | 状态 |
|---|---|---|
| `sprint-1/README.md` | Sprint 索引 + 待确认问题 + 验收总纲 | 迭代管理 |
| `sprint-1/01-account-deletion-overview.md` | 账号注销业务/数据/API/状态机/任务 | 迭代管理 |
| `sprint-1/02-account-deletion-frontend.md` | 账号注销前端 | 迭代管理 |
| `sprint-1/03-settlement-overview.md` | 结算对账业务/数据/API/流程/任务 | 迭代管理 |
| `sprint-1/04-settlement-frontend.md` | 结算对账前端 | 迭代管理 |
| `sprint-1/05-boundary-conditions.md` | 边界/异常/安全/QA | 迭代管理 |
| `sprint-1/SPEC-充值中心.md` | 充值中心 SPEC（引用 supplement/03） | 迭代管理 |

## 五、用户体系正式需求（2026-08-31，review，不可准入）

| 文档 | 文档 ID | 状态 | 定位 | owner | source_of_truth |
|---|---|---|---|---|---|
| `02-requirements/02-user-system/README.md` | PRD-USER-SYSTEM-INDEX-001 | review | 用户体系需求包入口 | product-agent | `PRD-USER-SYSTEM-001` |
| `02-requirements/02-user-system/PRD-用户体系-v1.0.0-review.md` | PRD-USER-SYSTEM-001 | review | 恢复后的用户体系高层 PRD；未恢复项不得作为要求 | product-agent | `_recovered/PRD-用户体系-recovery-decision-2026-08-31.md`、关联 accepted ADR |
| `_recovered/PRD-用户体系-recovery-decision-2026-08-31.md` | RECOVERY-USER-SYSTEM-20260831-001 | review | 610 行恢复范围、逐项裁决与 blocked 清单 | product-agent / arch-agent / dispatch-agent | 关联正式 ADR、SPEC、ARCH 与来源资料 |

## 六、恢复草稿（_recovered/，临时工作区）

> ⚠️ **非 canonical 需求源**（自证：`_recovered/PRD-用户体系-recovered-draft.notes.md`）。原 PRD 用户体系 1326 行中 610 行 `NEEDS-MANUAL-RECOVERY` 无法自动逆转，须人工仲裁后再升格正式 PRD。

| 文件 | 定位 | 处理要求 |
|---|---|---|
| `_recovered/PRD-用户体系-recovered-draft.md` | 用户体系恢复草稿 | 人工裁决 NEEDS-MANUAL-RECOVERY 行后升格正式 |
| `_recovered/PRD-用户体系-recovered-draft.notes.md` | 恢复说明（610 行待仲裁） | 记录处理状态 |

> 处理完成前禁止据此生成验收结论；处理后此目录内容移入正式 `02-requirements/…` 或 `_archive/`。

---

## 五点五、五大资金主题 OPS 登记（2026-08-31）

| 文档 | 文档 ID | 状态 | 定位 | owner | source_of_truth |
|---|---|---|---|---|---|
| `08-operations-and-deployment/finance-ops-package.md` | OPS-BILLING-PACKAGE-001 | review | 五主题统一发布、迁移、checksum/单执行者锁、失败即停、备份恢复、回滚、监控、值班与演练证据规范 | 运维 owner；dispatch-agent 登记 | `00-index/governance-policy.md`、`00-index/feature-package-matrix.md`、五主题 SPEC |
| `08-operations-and-deployment/release-runbook.md` | OPS-BILLING-RELEASE-001 | review | 五主题发布执行顺序、失败即停、发布后验收与证据归档 | 运维 owner | `finance-ops-package.md`、`deployment-checklist.md` |

> 上述 OPS 文档是 review，不是 approved；当前没有真实生产发布、破坏性迁移、备份恢复或回滚演练证据，不得据此宣称生产准入。

## 六、维护规则

1. **新增/删除/状态变更**：必须在本文件登记（ID、名称、目录、状态、权威层级、替代关系、owner）。
2. `approved`/`accepted` 才可作为开发与验收依据；`draft`/`review`/`来源资料`/`临时恢复草稿` 均不满足。
3. 冲突来源不得直接并入 `approved` 正文（见 ADR-0017）。
4. 目录引用范围在以下修正为"以本清单为准"：`docs/README.md`（2026-08-30 已列指向本文件），`00-index/README.md`（已指向）。
