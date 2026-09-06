# ADR-0017：章节权威来源映射

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：DEC-017

## 决策
每个新章节指定一个主权威来源；其他资料标为辅助、技术参考、冲突或历史来源。冲突来源不得直接进入 `approved` 正文，必须先登记 ADR 或冲突表。ARCH 实现内容不得复制进 PRD，ref 历史建议不得自动升格，历史资料只能通过 archive 引用。

`00-index/document-map.md` 必须登记每章的主权威来源、辅助来源、冲突来源、历史来源、状态和版本。

## 关联
`audit/08-deployment/document-decision-log.md#dec-017`
