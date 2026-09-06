# ADR-0006：余额账本与配置表唯一事实来源

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：DEC-006

## 决策
- `customer_balances` 是当前余额唯一事实来源，包含总额、可用、冻结、币种和版本。
- `balance_transactions` 记录每笔余额变动。
- `call_logs` 记录 API 请求及实际 Token/费用；`billing_logs` 记录计费过程。
- `platform_ledger` 当前不启用，作为架构预留。
- `users.balance` 为历史兼容对象，迁移后禁止新增业务引用。
- `system_configs` 为唯一系统配置表；`site_configs` 为历史名称。
- 缓存仅作读取加速，配置变更须记录操作人、前后值和生效时间。
- 资金链路：业务操作 → 原子更新余额 → 写流水 → 关联业务 → 写审计日志。

## 关联
`audit/08-deployment/document-decision-log.md#dec-006`
