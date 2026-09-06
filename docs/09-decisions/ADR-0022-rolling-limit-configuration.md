# ADR-0022：24 小时限额配置键名与优先级

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：BOSS 对 `open-issues.md` 项 3 的确认
- 关联 ADR：ADR-0001、ADR-0013

## 背景
既有文档同时使用 `operator_24h`/`recipient_24h` 与 `soft_limit`/`hard_limit`，且未明确单笔上限、累计限额和审批阈值的优先级。

## 决策
- 对外配置键统一为：
  - `limits.operator_24h`
  - `limits.recipient_24h`
  - `limits.exceed_action`
- `operator_24h` 按操作人统计，`recipient_24h` 按被入账用户统计；默认值均为 `50000.00`。
- `exceed_action` 仅取 `escalate` 或 `reject`：前者升级至少双人审批，后者直接拒绝。
- `soft_limit`/`hard_limit` 不作为对外配置键；如内部使用，只能作为实现细节，不能取代公开配置。
- 两个维度独立计算，任一维度超限即触发处置；`super_admin` 不得豁免。
- 优先级为：`invalid input → hard business limit → 24h operator/recipient limit → approval threshold → normal processing`。
- 单笔上限优先于 24 小时累计限额：超过单笔上限直接拒绝；未超过单笔上限但超过累计限额时按 `exceed_action` 处理。
- `exceed_action=escalate` 不得降低原有审批级别。
- 配置变更必须记录操作人、前后值、生效时间并清理相关缓存。

## 影响与迁移
更新资金风控 PRD/SPEC、配置 API、数据字典、缓存、测试和运维文档；旧键名标记为 superseded 或仅保留明确兼容映射；补充两个维度、边界优先级和配置变更审计测试。

## 关联文件
- `docs/02-requirements/03-billing-and-finance/balance-adjustment.md`
- `docs/03-functional-spec/03-billing-and-finance/balance-adjustment.md`
- `docs/00-index/open-issues.md`
- `audit/08-deployment/document-decision-log.md#dec-022`
