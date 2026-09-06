# ADR-0021：充值与人工上账审批阶段字段表达

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：BOSS 对 `open-issues.md` 项 2 的确认
- 关联 ADR：ADR-0003、ADR-0011

## 背景
充值和人工上账既有文档把审批阶段直接编码进业务对象 `status`，另有方案将审批阶段放入 metadata，导致数据库、管理端 API 和用户端 API 的语义不一致。

## 决策
- 业务对象 `status` 只表示资金业务状态：`pending`、`paid`、`rejected`、`failed`。
- 审批阶段单独使用 `approval_phase`：`none`、`level1`、`level2`、`super`、`completed`。
- 审批人、审批时间、审批结果和审批历史单独记录，不只依赖当前阶段字段。
- 管理端响应同时返回 `status`、`approval_phase` 和 `approval_required`；`status` 表示业务状态，`approval_phase` 表示审批阶段，`approval_required` 表示当前操作者是否仍需审批。
- 用户端只暴露 `pending`、`paid`、`rejected`、`failed`，不暴露内部审批阶段。
- `pending_level2`、`pending_super` 作为旧响应状态标记为 deprecated；新文档统一使用 `status + approval_phase`。
- 状态机中的阶段流转仍保留业务语义，但数据库持久化和 API 展示必须采用拆分字段，禁止混用两套表达。

## 影响与迁移
更新充值/人工上账 PRD、SPEC、状态机、API、数据库字典、前端文案和测试契约；为旧响应提供兼容/迁移说明；所有新接口不得新增 `pending_level2` 或 `pending_super` 作为业务 `status`。

## 关联文件
- `docs/02-requirements/03-billing-and-finance/recharge.md`
- `docs/02-requirements/03-billing-and-finance/manual-topup.md`
- `docs/03-functional-spec/03-billing-and-finance/recharge.md`
- `docs/03-functional-spec/03-billing-and-finance/manual-topup.md`
- `docs/06-data-and-architecture/state-machines/recharge-order.md`
- `docs/06-data-and-architecture/state-machines/manual-topup.md`
- `audit/08-deployment/document-decision-log.md#dec-021`
