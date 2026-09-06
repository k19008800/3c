# 用户体系产品需求文档（v1.0.0 review）

- document ID：PRD-USER-SYSTEM-001
- 文档 ID：PRD-USER-SYSTEM-001
- version：v1.0.0
- status：review
- owner：product-agent
- source_of_truth：[`../_recovered/PRD-用户体系-recovery-decision-2026-08-31.md`](../../_recovered/PRD-用户体系-recovery-decision-2026-08-31.md)；业务裁决以关联 accepted ADR 为准
- 建立日期：2026-08-31

> 本文档是恢复后的正式审阅稿，不是 approved 文档。它不把 recovered 草稿直接升格为 canonical，也不替代 SPEC/API/ARCH/TEST/OPS。

## 1. 目标与范围

为平台客户、代理、销售及管理角色提供统一的身份、权限、账户安全、用量、API 接入和资金相关用户体验。用户体系覆盖：

- 用户身份、状态、角色与权限可见性；
- 用户控制台仪表盘、模型浏览、API Key、调用日志和用量统计；
- 充值入口、交易明细、兑换码、发票等用户侧资金体验；
- Onboarding、通知偏好、账户安全、登录记录、账号注销；
- 页面级标题 `[?]` 帮助和每个按钮/操作入口旁的 `[?]` 帮助说明。

不在本 PRD 中冻结支付、资金状态机、API schema、数据库迁移、实现参数或视觉线框；这些由对应正式契约承接。

## 2. 角色与权限

当前 canonical 角色仅为 `customer`、`agent`、`sales`、`admin`、`super_admin`。`finance` 是权限包语义，不是数据库角色；`finance_ops`、`ops`、`support`、`auditor`、`user` 等不得作为当前角色枚举。权限按权限点鉴权，默认拒绝，显式 deny 优先；前端显隐不能替代后端校验。

权限计算顺序、最后一个 `super_admin` 保护、403 `PERMISSION_DENIED`、职责分离及敏感操作 2FA 以 ADR-0004、ADR-0008、ADR-0024 和 `06-data-and-architecture/permissions-and-authorization.md` 为准。

## 3. 用户控制台

### 3.1 仪表盘

仪表盘提供欢迎信息、核心指标、额度/预算状态、用量概览、趋势、模型分布、Key 对比、快捷操作、最近登录、Onboarding、成本预测、告警、账单周期、实时活动流、成本优化和技术文档入口等能力。各区域可独立加载、展示空状态和错误状态；具体接口与刷新策略不得从恢复乱码推断，须以 `SPEC-§2-用户体系.md`、`ref-2.2-user-dashboard.md` 及后续正式 SPEC 联合评审为准。

### 3.2 模型、Key、日志与统计

用户可浏览可用模型及价格/状态，创建并管理 API Key，查看调用日志、用量统计、失败/超时信息并按授权范围导出。Key 明文仅在创建时展示，后端不保存明文；权限变更和禁用应及时生效。具体 Key 阈值、导出上限、保留期、模型白/黑名单契约列为 `BLOCKED-USER-RECOVERY`。

## 4. 资金相关用户体验

用户可从控制台进入充值、查看交易/余额变动、申请发票和使用兑换码。所有余额变更必须遵循资金域的账本、精度、幂等、审批、权限和状态机契约；用户体系不得自行定义另一套金额或角色规则。资金域 accepted ADR 与 review PRD/SPEC/API 尚未使本主题整体达到开发准入。

充值优惠、对公转账、支付超时/异常、兑换码完整契约、发票门槛/手续费/跨月规则均为 `BLOCKED-USER-RECOVERY`，需产品、财务/架构联合确认。

## 5. 安全、通知、Onboarding 与注销

用户可修改安全设置、查看登录历史和设备、管理 2FA 与通知偏好；新用户可按步骤完成创建 Key、首次调用和查看用量等接入引导；用户可发起账号注销并查看进度。高风险数据删除、实名信息、冷静期、匿名化保留和通知强制项不能从恢复草稿猜测，需独立裁决。

## 6. 帮助说明门禁

每个用户体系页面标题旁必须提供页面级 `[?]`，每个按钮/操作入口旁必须提供按钮级 `[?]`。正式 SPEC/实现/测试必须分别提供帮助内容、入口对照和验证证据；本 PRD 只冻结这一产品门禁。

## 7. 验收范围（审阅基线，不是准入基线）

- 身份与权限遵循 canonical 角色及 deny 优先规则；
- 用户只能访问其授权数据范围，管理操作有审计，敏感操作有二次确认/2FA；
- 仪表盘与用户侧工具具备加载、空、错误状态；
- API Key 不泄露明文，禁用/删除行为可追溯；
- 资金入口不绕过资金域契约；
- 每个页面和操作入口均有 `[?]` 帮助；
- 所有具体接口、状态机、数据、测试和运维证据在下游文档完成后再形成准入结论。

## 8. 明确废弃/重新确认项

详见 [`../../_recovered/PRD-用户体系-recovery-decision-2026-08-31.md`](../../_recovered/PRD-用户体系-recovery-decision-2026-08-31.md) §3。恢复草稿中的旧角色、旧 API/Schema、旧金额示例、视觉线框与未交叉验证阈值不属于本 PRD。

## 9. 关联来源

- [`../../_recovered/PRD-用户体系-recovery-decision-2026-08-31.md`](../../_recovered/PRD-用户体系-recovery-decision-2026-08-31.md)
- [`../../SPEC-§2-用户体系.md`](../../SPEC-§2-用户体系.md)
- [`../../SPEC-§18-用户端体验增强.md`](../../SPEC-§18-用户端体验增强.md)
- [`../../ref-2.1-roles-permissions.md`](../../ref-2.1-roles-permissions.md)
- [`../../ref-2.2-user-dashboard.md`](../../ref-2.2-user-dashboard.md)
- [`../../09-decisions/ADR-0024-role-and-permission-precedence.md`](../../09-decisions/ADR-0024-role-and-permission-precedence.md)
- [`../../06-data-and-architecture/permissions-and-authorization.md`](../../06-data-and-architecture/permissions-and-authorization.md)
