# ADR-0018：第一批核心资金文档目录与主题拆分

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：DEC-018

## 决策
建立 `00-index`、`01-product`、`02-requirements/03-billing-and-finance`、`03-functional-spec/03-billing-and-finance`、`05-api`、`06-data-and-architecture`、`07-quality-and-acceptance`、`08-operations-and-deployment`、`09-decisions`。财务拆为充值、人工上账、调账、退款/红冲、结算/对账五个主题，并建立状态机、权限、精度、API、错误码、幂等、通知、数据字典和迁移专章。

`finance-overview.md` 只作地图和导航，不重复定义业务规则。

## 关联
`audit/08-deployment/document-decision-log.md#dec-018`
