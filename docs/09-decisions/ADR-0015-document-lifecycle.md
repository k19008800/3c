# ADR-0015：文档正式生效与迁移

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：DEC-015

## 决策
- 文档完成内容、冲突、术语、金额、状态、权限、API、数据库和链接复核，并通过联合评审后才可 `approved`。
- `draft/review/ref` 和历史审计报告不得作为开发或验收唯一依据。
- 迁移顺序：冻结快照 → 建目录/索引/术语/ADR → 拆正文 → 清理链接 → 联合复核 → approved → superseded → archive。
- 不覆盖旧文档，不将代码现状自动升格为需求；差异标为 `DOC_CODE_GAP` 或 `CODE_DOC_DRIFT`。
- 规则变更使用语义化版本并记录迁移影响。

## 关联
`audit/08-deployment/document-decision-log.md#dec-015`
