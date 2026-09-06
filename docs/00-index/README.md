# 3cloud 正式文档入口

- 文档 ID：INDEX-CORE-001
- 状态：review
- 生效版本：v1.0.0
- 建立日期：2026-08-29
- **2026-08-30 修订**：明确本文档为全库**唯一准入入口**，并新增 [`document-inventory.md`](document-inventory.md)（全量当前文档清单），将 `supplement/`、`sprint-1/`、`_recovered/` 纳入治理范围。
- **2026-08-30 复核修订**：基于 BOSS 人工确认（选择 A），冻结人工上账单笔上限 ¥50,000（参见 [`open-issues.md`](open-issues.md) 第 13 项），同步修订 PRD/ARCH-整改R5-R7-资金风控.md 中与此冲突的历史 B3/B20 表述。

> ⚠️ **权限裁定**：本文档（`00-index/README.md`）及其 `document-map.md`、`document-inventory.md` 是判断"哪个文档可作开发与验收依据"的唯一权威；`docs/README.md`、`PRD-README.md` 的引用范围不覆盖本入口。

## 当前阶段

第一批核心资金文档正在整理。现有 `docs/` 根目录文件（含 `PRD-README.md`、`ref-*.md`、`supplement/`）作为来源/需求资料，不因索引建立而自动成为 `approved` 正文；未经本入口登记与评审不得作为开发依据。

## 阅读顺序

1. 本文件（正文开头）
2. [治理政策](./governance-policy.md)（唯一入口、状态机与开发准入）
3. [十四个核心业务主题全链路交付矩阵](./feature-package-matrix.md)（ADR/PRD/SPEC/状态机/权限数据/API/TEST/OPS、业务裁决、证据与 owner）
4. [文档地图](./document-map.md)（第一批核心资金主题追溯）
5. [文档清单](./document-inventory.md)（全库当前文档，含 supplement/sprint-1/_recovered、历史迭代计划与旧 API 契约）
6. [整改验证报告（2026-09）](../07-quality-and-acceptance/remediation-verification-report-2026-09.md)（实际改动、扫描/测试与未决阻断）
7. [术语表](./glossary.md)

> 当前生效裁决：[`ADR-0030`](../09-decisions/ADR-0030-four-contract-rulings.md) 已 accepted，并已同步登记于 [`decision-register.md`](./decision-register.md) 与 [`document-inventory.md`](./document-inventory.md)。
8. [决策登记](./decision-register.md)（accepted ADR 一览）
9. 第一批 PRD/SPEC/API/ARCH/TEST/OPS（待拆分）
10. [未决事项](./open-issues.md)

## 目录定位速查

| 目录/文件 | 定位 | 是否需求依据 |
|---|---|---|
| `00-index/feature-package-matrix.md` | 十四个核心主题全链路状态、业务裁决、证据与 owner 追踪 | 是（登记用） |
| `00-index/document-map.md` | 第一批核心资金主题 → PRD/SPEC/…/OPS 追溯 | 是（登记用） |
| `00-index/document-inventory.md` | 全量当前文档清单与状态 | 是（登记用） |
| `02-requirements/…` | 核心资金 PRD | 评审后 approve |
| `03-functional-spec/…` | 核心资金 SPEC | 评审后 approve |
| `05-api/…` | API 契约 | 评审后 approve |
| `06-data-and-architecture/…` | 状态机/权限/数据 | 评审后 approve |
| `07-quality-and-acceptance/…` | 验收/发布基线 | 评审后 approve |
| `08-operations-and-deployment/…` | 部署/迁移/运维 | 评审后 approve |
| `09-decisions/ADR-*.md` | 决策（accepted 即依据） | 是（accepted） |
| `supplement/` | 重写前补充规格（01–09） | draft 来源，待纳入 |
| `sprint-1/` | Sprint 细化文档 | 项目迭代管理 |
| `_recovered/` | 恢复草稿（临时工作区） | 否，需人工裁决 |
| `docs/iteration-plan-v1.md` / `iteration-plan-v2.md` | 历史迭代快照/执行计划 | 否；不得替代当前 release baseline |
| `docs/api-contract.md` | 历史 API 汇总与迁移参考 | 否；canonical 契约在 `05-api/` |
| `07-quality-and-acceptance/remediation-verification-report-2026-09.md` | 本轮整改实际验证记录 | 证据登记；不单独授予准入 |
| `docs/` 根目录 `PRD-*.md`、`ref-*.md`、`SPEC-*.md` | 既有来源/需求资料 | 来源，待迁移 |

## 权威层级

完整治理规则见 [`governance-policy.md`](governance-policy.md)；交付缺口见 [`feature-package-matrix.md`](feature-package-matrix.md)。

ADR → PRD → SPEC → ARCH → API → TEST → OPS → ARCHIVE。只有 `accepted` ADR 和 `approved` 正式文档可作为开发与验收依据。`supplement/`、`_recovered/`、根目录既有 PRD/SPEC 均未达到 `approved`，不得作为唯一验收依据。
