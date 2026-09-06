# 用户体系恢复裁决记录

- document ID：RECOVERY-USER-SYSTEM-20260831-001
- 文档 ID：RECOVERY-USER-SYSTEM-20260831-001
- version：v1.0.0
- status：review
- owner：product-agent / arch-agent / dispatch-agent（联合恢复记录）
- source_of_truth：本记录；裁决事实以所列正式 ADR、SPEC 与来源文档为准
- 日期：2026-08-31

## 1. 恢复范围与结论

本次只治理用户体系需求文档，不修改 API、代码或其他业务文档。`_recovered/PRD-用户体系-recovered-draft.md` 保持临时恢复草稿身份，不升格、不改为 canonical。

原始 PRD 1326 行，恢复说明记录：25 行严格逆转候选、691 行保留原文、610 行无法安全逆转。当前 UTF-8 文件中可直接检出的 `NEEDS-MANUAL-RECOVERY` 标记为 229 处（标记可能覆盖多行语义，不能以标记数替代原始 610 行数）。这些内容按章节归并为 7 类：角色/权限 20 处；仪表盘与模型中心 23 处；API Key 约 32 处；调用日志/统计约 21 处；充值约 16 处；兑换码约 4 处；发票约 5 处；其余为同一恢复块中的界面线框、说明性文字和重复标记。

结论：可以建立正式用户体系 PRD v1.0.0 **review 版**，但不能声称完整恢复。正式 PRD 只收录有可交叉验证依据的业务范围与不冲突约束；无法可靠恢复的具体阈值、页面细节、接口契约和运营规则不写成正式要求，列入 blocked/重新确认清单。

## 2. 逐项裁决

| 裁决 ID | 恢复主题 | 结论 | 依据 | 处理 |
|---|---|---|---|---|
| R-USER-001 | 角色枚举与权限优先级 | 采用 canonical `customer/agent/sales/admin/super_admin`；显式 deny 优先 | `09-decisions/ADR-0024-role-and-permission-precedence.md`；`06-data-and-architecture/permissions-and-authorization.md` | 正式 PRD 收录；恢复草稿中的 `user/developer/finance/auditor/operator/security/agent_mgr` 不采纳为数据库角色 |
| R-USER-002 | 权限点、职责分离、审计 | 采用权限点鉴权、默认拒绝、403 `PERMISSION_DENIED`、敏感操作审计/2FA约束 | `09-decisions/ADR-0004-permission-model.md`、ADR-0008、ADR-0024；ARCH-BILLING-003 | 正式 PRD 收录；旧 Bitset 细节仅作历史参考 |
| R-USER-003 | 用户端仪表盘 | 采用 16 区域的产品范围及已在 SPEC 明确的行为；不采纳无法验证的线框视觉细节 | `SPEC-§2-用户体系.md`；`ref-2.2-user-dashboard.md`；`SPEC-§18-用户端体验增强.md` | 正式 PRD 收录为 review；细节以 SPEC 后续一致性审查为前置 |
| R-USER-004 | API Key 管理 | 采用一次性明文展示、后端仅存 hash、禁用/删除和模型范围等已有安全约束 | `SPEC-§2-用户体系.md`、`ref-2.2.3-api-keys.md`（如存在）及 `ref-2.2-user-dashboard.md` | 正式 PRD 收录；闲置/过期阈值存在来源差异，暂不冻结 |
| R-USER-005 | 日志、统计、成本预测 | 采用查看调用记录、用量聚合、失败/超时与导出能力；算法和展示阈值只采用 SPEC 已明确且无冲突部分 | `SPEC-§2-用户体系.md`、`ref-2.2-user-dashboard.md`、`SPEC-§18-用户端体验增强.md` | 正式 PRD 收录为范围；具体数据保留期、导出上限和预测最低样本数 blocked |
| R-USER-006 | 充值、余额与资金流水 | 充值属于资金域；采用已批准资金契约、余额账本、幂等、金额精度和审批约束，不采纳恢复稿旧角色/旧路径/旧金额规则 | `ADR-0001/0002/0006/0009/0020/0021/0022/0030`；资金 PRD/SPEC/API | 正式 PRD 只收录用户视角入口和依赖；支付渠道、优惠、对公转账细节回到资金主题确认 |
| R-USER-007 | 发票、兑换码 | 现有来源可证明存在产品范围，但字段、金额门槛、审核与状态存在来源差异 | `SPEC-§2-用户体系.md`、`SPEC-§18-用户端体验增强.md`及历史来源 | 保留为 review 范围；不冻结具体规则，列 blocked |
| R-USER-008 | 注销、安全、通知、Onboarding | 采用已有正式/迭代文档明确且不冲突的范围；删除、保留、实名退回等高风险细节不从乱码猜测 | `SPEC-§2-用户体系.md`、`SPEC-§18-用户端体验增强.md`、`sprint-1/01-account-deletion-overview.md` | 仅收录能力范围；生命周期/保留期限需单独裁决 |
| R-USER-009 | 线框、文案、图标、动画、颜色 | 无法从正式来源稳定确认，不作为需求事实 | recovered draft 与参考 SPEC 的差异 | 废弃本轮恢复；由产品重新确认后另开变更 |
| R-USER-010 | 恢复草稿中的旧 API、Schema、角色和金额示例 | 与已接受 ADR/当前 ARCH/API 存在冲突或仅为示例，不能升格 | ADR-0024、ADR-0030、`05-api/*`、`06-data-and-architecture/*` | 废弃为 canonical 要求；保留草稿供追溯 |

## 3. 正式 PRD 可恢复部分的边界

已恢复并写入正式 review PRD：用户身份与权限能力范围、用户端仪表盘/模型/Key/日志/统计/充值/交易/兑换码/发票的产品范围、账户安全、通知、Onboarding、账号注销的高层目标、页面级与操作级 `[?]` 帮助门禁、与资金域和权限架构的依赖。

未恢复、不得猜测：

1. 旧乱码中的全部逐字 UI 线框、图标、颜色、动画、文案。
2. 与当前 canonical 角色不一致的角色名、等级、模板和 API 权限字符串。
3. API Key 闲置/沉睡/自动禁用的阈值；具体导出范围、保留期和异步策略。
4. 充值优惠、对公转账凭证、支付超时和到账异常的具体规则（须与资金 PRD/SPEC/API 联合裁决）。
5. 兑换码类型、次数、折扣与核销状态的完整契约。
6. 发票最低金额、手续费、合并月份、快递单号和跨月开票规则。
7. 账单预测、告警、异常登录的具体阈值，以及实时流重连/缓存等实现参数。
8. 删除/注销的数据保留、匿名化、冷静期和实名信息处理的最终口径。

上述项目统一标记为 `BLOCKED-USER-RECOVERY`，需要产品 owner 与架构/合规 owner 重新确认；本记录不将其包装为已恢复。

## 4. 验证记录

- 盘点范围：`_recovered/PRD-用户体系-recovered-draft.md` 及 notes、正式/历史用户体系来源、ADR-0004/0008/0024/0030、权限 ARCH、用户体验 SPEC。
- `NEEDS-MANUAL-RECOVERY`：恢复草稿 229 处；notes 仍明确原始不可逆行为为 610 行。正式 PRD 和本记录不含该标记。
- 状态：恢复草稿仍为临时来源；本记录和正式 PRD 均为 `review`，无 `approved`/`accepted` 变更。
- ID/version/status/source_of_truth：本记录与正式 PRD 均已提供；待索引登记。
- 链接：正式 PRD 仅引用当前可访问的相对文档；链接检查需由治理 owner 在登记后复跑。
