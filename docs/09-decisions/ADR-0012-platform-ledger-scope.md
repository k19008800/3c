# ADR-0012：platform_ledger 启用范围

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：DEC-012

## 决策
- 当前版本不启用、不写入 `platform_ledger`。
- 充值、扣费、退款、调账和红冲不得依赖该表完成。
- 当前余额与对账依据为 `customer_balances`、`balance_transactions`、业务单据和 `billing_logs`。
- 该表仅作架构预留；启用前须另行完成科目、借贷、事件映射、期初迁移、对账、补账规则、ADR 和迁移方案。

## 关联
`audit/08-deployment/document-decision-log.md#dec-012`
