# ADR-0019：文件命名、文档编号、语义化版本与状态

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：DEC-019

## 决策
- 正式文件使用小写 kebab-case，并按目录和业务域组织。
- 编号按类型、业务域和三位序号，例如 `PRD-BILLING-001`、`SPEC-BILLING-001`、`SM-BILLING-001`；ADR 使用 `ADR-0001`。
- 版本使用 `vMAJOR.MINOR.PATCH`：不兼容变更递增 MAJOR，兼容新增递增 MINOR，澄清/修订递增 PATCH。
- 正式文档状态为 `draft/review/approved/superseded`；ADR 状态为 `proposed/accepted/rejected/superseded`。
- 只有 `approved`/`accepted` 文档可作为开发和验收依据。
- 规则变更记录前后规则、生效版本/时间、影响范围、迁移方案及关联代码/测试；历史版本标记 `superseded` 后归档。

## 关联
`audit/08-deployment/document-decision-log.md#dec-019`
