# 十四个核心业务主题全链路交付矩阵

- 文档 ID：INDEX-PACKAGE-BILLING-001
- version：v1.1.0
- status：review
- owner：dispatch-agent（登记）；各列缺口由表内 owner 负责关闭
- source_of_truth：[`governance-policy.md`](governance-policy.md)、[`document-inventory.md`](document-inventory.md)、[`decision-register.md`](decision-register.md)
- 建立日期：2026-08-31
- 最近核对：2026-09-05

> 本矩阵是登记与追踪视图，不是业务批准单。单元格中的 `accepted`/`approved` 只表示该文档自身的登记状态；只有完整链路及真实 TEST/OPS 证据闭环后，主题才可准入。本文不把任何 `review` PRD/SPEC 提升为 `approved`。

## 状态口径

- `accepted`：正式 ADR 已接受，可作为裁决依据。
- `approved`：正式文档已批准；不等于对应主题整包批准。
- `review` / `draft`：已登记但未准入。
- `来源`：仅有根目录 PRD/SPEC/ref、KB 或迭代材料，非 canonical 正文。
- `缺失`：未找到该链路交付物；不得从代码行为推定为已关闭。
- 证据状态中的“部分历史证据”仅表示仓库存在测试或旧执行记录，不代表当前候选版本通过。

## 十四主题总矩阵

| 主题 | ADR | PRD | SPEC | 状态机 | 权限/数据 | API | TEST | OPS | 业务裁决状态 | 证据状态 | owner |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 用户与权限 | `accepted`：ADR-0004、0024、0025 | `review`：`02-requirements/02-user-system/PRD-用户体系-v1.0.0-review.md`（存在不可恢复范围） | `来源`：`SPEC-§2-用户体系.md`、`SPEC-§30-权限管理.md` | `缺失`：无主题正式状态机 | `approved`：`06-data-and-architecture/permissions-and-authorization.md`；数据专章仅覆盖资金核心表 | `缺失`：无 `05-api` 用户/权限主题契约 | `缺失`：无主题 TEST 包 | `缺失`：无主题 OPS 包 | 角色/deny 优先级与 SSO 会话裁决已关闭；用户 PRD 恢复范围仍 blocked | 未形成当前候选版本全链路证据 | product-agent / security-agent |
| API Key | `缺失`：无专属 ADR；可引用 ADR-0005、0011 的通用 API 裁决 | `来源`：`PRD-用户体系.md`、`ref-2.2.3-api-keys.md` | `来源`：`SPEC-§2-用户体系.md` | `缺失` | `缺失`：无正式权限/数据专章 | `缺失`：无 `05-api` API Key 契约；`api-contract.md` 仅历史参考 | `缺失`：无主题 TEST 包 | `缺失`：无主题 OPS 包 | 专属业务裁决未登记 | 仅代码/历史资料，不构成准入证据 | product-agent / api-agent |
| 供应商与模型 | `缺失`：无专属 ADR | `来源`：`PRD-核心引擎.md`、渠道/定价 PRD、`ref-4.3-vendor-model.md` | `来源`：`SPEC-§5-核心引擎.md`、`SPEC-§25-供应商增强.md` | `缺失` | `缺失`：无正式主题权限/数据专章 | `缺失`：无 `05-api` 主题契约 | `缺失`：无主题 TEST 包 | `缺失`：无主题 OPS 包 | 尚无完整专属裁决集 | 仅来源与代码测试零散存在 | product-agent / routing-agent |
| 充值 | `accepted`：ADR-0001、0002、0003、0009、0021 | `review`：`02-requirements/03-billing-and-finance/recharge.md` | `review`：`03-functional-spec/03-billing-and-finance/recharge.md` | `approved`：`state-machines/recharge-order.md` | `approved`：公共资金权限/数据/精度专章 | `approved`：`05-api/user/recharge.md` | `review`：`finance-test-package.md`；部分历史实跑 | `review`：`finance-ops-package.md` | 自助充值单笔上限 ¥1,000,000 等裁决已关闭 | 回调验签、金额核对、熔断、审批边界及恢复证据未闭环 | product-agent / test-agent / ops-owner |
| 人工上账 | `accepted`：ADR-0001、0004、0008、0009、0013、0022 | `review`：`02-requirements/03-billing-and-finance/manual-topup.md` | `review`：`03-functional-spec/03-billing-and-finance/manual-topup.md` | `approved`：`state-machines/manual-topup.md` | `approved`：公共资金权限/数据专章 | `approved`：`05-api/admin/manual-topup.md` | `review`：`finance-test-package.md`；部分历史实跑 | `review`：`finance-ops-package.md` | 单笔 ¥50,000；操作员及收款人滚动 24h 各 ¥50,000；操作级 2FA 必需，裁决已关闭 | 2FA 操作摘要绑定、一次性消费/防重放、fail-closed 及 TEST/OPS 证据未闭环，生产阻断 | finance-owner / security-agent / test-agent |
| 调账 | `accepted`：ADR-0001、0003、0004、0008、0009 | `review`：`02-requirements/03-billing-and-finance/balance-adjustment.md` | `review`：`03-functional-spec/03-billing-and-finance/balance-adjustment.md` | `approved`：`state-machines/adjustment.md` | `approved`：公共资金权限/数据专章 | `approved`：`05-api/admin/balance-adjustment.md` | `review`：`finance-test-package.md`；部分历史实跑 | `review`：`finance-ops-package.md` | 金额、SoD、2FA 与状态机口径已有 accepted ADR | 完整非法转移、故障补偿、迁移/恢复证据未闭环 | finance-owner / test-agent / ops-owner |
| 退款/红冲 | `accepted`：ADR-0003、0004、0008、0009、0020 | `review`：`02-requirements/03-billing-and-finance/refund-and-reversal.md` | `review`：`03-functional-spec/03-billing-and-finance/refund-and-reversal.md` | `approved`：`state-machines/refund.md` | `approved`：公共资金权限/数据专章 | `approved`：`05-api/admin/refund-and-reversal.md` | `review`：`finance-test-package.md`；多数专项待新增 | `review`：`finance-ops-package.md` | 退款分型、禁止负余额等业务裁决已关闭 | 通道适配、失败注入/重试、并发、outbox、崩溃恢复未闭环 | finance-owner / test-agent / ops-owner |
| 计费 | `accepted`：ADR-0002、0006、0012 | `来源`：`PRD-核心引擎.md`、计费/缓存定价 PRD | `来源`：`SPEC-§5-核心引擎.md`、`supplement/01-计费引擎状态机.md`（draft） | `draft 来源`：`supplement/01-计费引擎状态机.md` | `approved`：资金精度/数据字典；计费主题数据专章缺失 | `缺失`：无 `05-api` 计费主题契约 | `缺失`：无主题 TEST 包 | `缺失`：无主题 OPS 包 | 精度、账本范围等横向裁决已关闭；计费主题完整裁决未登记 | 存在零散测试/历史材料，无主题候选证据 | billing-owner / architecture-owner |
| 结算 | `accepted`：ADR-0003、0004、0008、0030 | `review`：与对账共用 `settlement-and-reconciliation.md` | `review`：与对账共用同名 SPEC | `approved`：`state-machines/settlement.md` | `approved`：公共资金权限/数据/事务专章 | `approved`：`05-api/admin/settlement-and-reconciliation.md` | `review`：`finance-test-package.md`；部分历史实跑 | `review`：`finance-ops-package.md` | 权限点和职责分离业务裁决已关闭 | 正式结算周期、资金事务、独立 2FA、迁移/恢复证据未闭环 | finance-owner / test-agent / ops-owner |
| 对账 | `accepted`：ADR-0002、0003、0004、0008、0030 | `review`：与结算共用 `settlement-and-reconciliation.md` | `review`：与结算共用同名 SPEC | `approved`：`state-machines/settlement.md`；对账报告状态已入正式实现说明 | `approved`：公共资金权限/数据/事务专章 | `approved`：`05-api/admin/settlement-and-reconciliation.md` | `review`：`finance-test-package.md`；P0 有历史专项记录 | `review`：`finance-ops-package.md` | 报告/处理权限等业务裁决已关闭，不再标业务冲突 | 分布式锁、异步补偿、外部账单、真实跨系统对账、恢复演练未闭环 | finance-owner / test-agent / ops-owner |
| 兑换码 | `缺失`：无专属 ADR | `来源`：`PRD-财务模块增强.md`、`ref-2.2.8-redemption-invoices.md` | `来源`：`SPEC-§9-财务模块增强（拆分迁移中）.md` | `缺失` | `缺失`：无正式主题权限/数据专章 | `缺失`：无 `05-api` 主题契约 | `缺失`：无主题 TEST 包 | `缺失`：无主题 OPS 包 | 尚无 accepted 专属业务裁决 | 仅来源与代码零散存在 | product-agent / finance-owner |
| 通知 | `accepted`：ADR-0010、0027 | `来源`：通知/价格变更相关 PRD 与 `ref-4.14.5-notification-rules.md` | `来源`：`SPEC-ref-notification-templates.md` 等 | `缺失` | `approved`：`06-data-and-architecture/event-and-notification.md` | `缺失`：无 `05-api` 通知主题契约 | `缺失`：无主题 TEST 包 | `缺失`：无主题 OPS 包 | outbox 与 webhook 方向裁决已关闭；产品通知范围未形成正式 PRD | outbox 故障注入、投递/重试与运维证据未闭环 | product-agent / platform-agent |
| 审计 | `缺失`：无专属 ADR；受 ADR-0004、0008 横向约束 | `来源`：`PRD-系统管理员支撑.md`、`ref-12.1-audit-console.md` | `来源`：`SPEC-§12-系统管理员支撑.md` | `缺失` | `缺失`：无正式审计权限/数据专章 | `缺失`：无 `05-api` 审计主题契约 | `缺失`：无主题 TEST 包 | `缺失`：无主题 OPS 包 | 留存、完整性与导出边界尚无专属 accepted 裁决 | 无主题级当前候选证据 | compliance-owner / security-agent |
| 数据导出与删除 | `缺失`：无专属 ADR | `来源`：`PRD-数据导出授权管理.md`；用户正式 PRD 为 `review` 且有恢复缺口 | `来源`：用户/合规相关根目录 SPEC | `缺失` | `缺失`：无正式主题权限/数据专章 | `缺失`：无 `05-api` 主题契约 | `缺失`：无主题 TEST 包 | `缺失`：无主题 OPS 包 | 授权、保留、删除范围及不可删除法定记录尚未形成完整 accepted 裁决 | 无端到端删除、导出授权、恢复与审计证据 | compliance-owner / product-agent |

> 路径未写目录前缀的状态机均位于 `06-data-and-architecture/state-machines/`。公共资金权限/数据专章指 `permissions-and-authorization.md`、`data-dictionary.md`、`billing-and-money-precision.md` 与 `transaction-and-concurrency.md` 中适用部分。

## 交付包最低内容

每个主题必须形成 `ADR → PRD → SPEC → 状态机 → 权限/数据 → API → TEST → OPS` 的可追溯链路。TEST 必须包含可复核的当前候选提交、命令、环境、结果与原始输出；OPS 必须包含发布、迁移、监控、告警、回滚、备份恢复、值班责任和演练证据。文件存在或迭代任务完成均不等于证据通过。

## 当前结论

1. 十四主题中，仅五个资金主题具备较完整的正式文档骨架；其 PRD/SPEC 仍为 `review`，不得准入。
2. 结算与对账的业务权限裁决已经关闭，但 TEST/OPS 和完整实现证据未关闭；二者不得混写。
3. ADR-0008 已 `accepted`，但操作摘要绑定、一次性消费/重放保护与 fail-closed 行为仍是实现及证据生产阻断，见 [`open-issues.md`](open-issues.md)。
4. 当前发布结论仍以 [`../07-quality-and-acceptance/release-baseline.md`](../07-quality-and-acceptance/release-baseline.md) 的 `not_ready` 为准。
