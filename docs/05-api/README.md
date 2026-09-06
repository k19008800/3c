# API 契约入口

- 文档 ID：API-INDEX-001
- 状态：approved
- 生效版本：v1.0.0
- 权威依据：`00-index/document-map.md`、`00-index/document-inventory.md`、ADR-0005（版本）、ADR-0009（幂等）、ADR-0011（响应/错误）、ADR-0023（alias 兼容窗口）
- 定位：`05-api/` 目录索引（第一批核心资金 API 契约层）

## 一、目录定位

本目录承载**核心资金第一批 API 契约**，是 `03-functional-spec` 各 SPEC 的下游 `API` 层，也是前后端、测试对同一请求/响应、权限、幂等和失败语义达成一致的依据。只有 `approved` 文档可作为开发与验收依据。

- **通用契约**：`conventions.md`（路径/两表面/响应 envelope/认证/幂等/金额序列化）、`errors.md`（错误码字典）、`idempotency.md`（资金幂等规范）。
- **主题契约**：用户充值 + 管理端人工上账/调账/退款红冲/结算对账（`admin/finance.md` 为管理端总入口，逐主题另有专属文件）。

## 二、文件清单与追溯

| 文件 | 文档 ID | 状态 | 对应 PRD/SM/SPEC | 说明 |
|---|---|---|---|---|
| `conventions.md` | API-CORE-001 | approved | — | 统一约定：两表面、路径、响应 envelope、认证、幂等、金额序列化 |
| `errors.md` | API-CORE-002 | approved | — | 平台业务 API 错误码字典（含实现差异 DOC_CODE_GAP） |
| `idempotency.md` | API-BILLING-001 | approved | `06-data-and-architecture/transaction-and-concurrency.md` | 资金幂等规范（ADR-0009） |
| `user/recharge.md` | API-BILLING-USER-RECHARGE | approved | [PRD-BILLING-001](../02-requirements/03-billing-and-finance/recharge.md) / [SM-充值](../06-data-and-architecture/state-machines/recharge-order.md) | 用户自助充值契约 |
| `admin/finance.md` | API-BILLING-003 | approved | 五主题 | 管理端资金总入口（充值审核/人工上账/调账/退款/对账/结算承载于此） |
| `admin/manual-topup.md` | API-BILLING-MANUAL-TOPUP | approved | [PRD-BILLING-002](../02-requirements/03-billing-and-finance/manual-topup.md) / [SM-人工上账](../06-data-and-architecture/state-machines/manual-topup.md) | 人工上账专属契约 |
| `admin/balance-adjustment.md` | API-BILLING-ADJ | approved | [PRD-BILLING-003](../02-requirements/03-billing-and-finance/balance-adjustment.md) / [SM-调账](../06-data-and-architecture/state-machines/adjustment.md) | 调账/审批/红冲 |
| `admin/refund-and-reversal.md` | API-BILLING-003-RF | approved | [PRD-BILLING-004](../02-requirements/03-billing-and-finance/refund-and-reversal.md) / [SM-退款](../06-data-and-architecture/state-machines/refund.md) | 退款/红冲 |
| `admin/settlement-and-reconciliation.md` | API-BILLING-005 | approved | [PRD-BILLING-005](../02-requirements/03-billing-and-finance/settlement-and-reconciliation.md) / [SM-结算](../06-data-and-architecture/state-machines/settlement.md) | 对账/结算 |

## 三、已知问题（需登记）

- ~~**文档 ID 冲突**：~~**已裁决（D-04，2026-09）**：`user/recharge.md` 与 `admin/manual-topup.md` 原共用 `API-BILLING-002`，现拆分为 `API-BILLING-USER-RECHARGE`（用户自助充值）与 `API-BILLING-MANUAL-TOPUP`（管理端人工上账），已同步 `00-index/document-inventory.md`。
- **实现差异**：`errors.md` §4 登记的 `INSUFFICIENT_BALANCE` 双语义、分页字段 `list/pagination` vs `items/page/page_size/total` 等 `DOC_CODE_GAP` 随整改收敛，见 `00-index/open-issues.md`。

## 四、读取顺序与追溯

1. `conventions.md` → `errors.md` → `idempotency.md`（通用契约）；
2. 按主题读 `admin/finance.md`（管理端总入口）+ 对应专属文件与 `user/recharge.md`；
3. 每份契约头部双向链接到 `02-requirements`（PRD）、`03-functional-spec`（SPEC）与 `06-data-and-architecture/state-machines`（SM）。

新增/修改/删除 API 契约须在 `00-index/document-inventory.md` 登记，状态变更遵循 ADR-0015/0019。