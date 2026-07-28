# 3Cloud (3C) AI Token 聚合平台 — 运营级产品需求说明书

> **状态**：这是运营级 PRD 的总入口。各章节已拆分为独立子文档，点击链接跳转。
> **版本**：V4.1-用户视角增强 | **最后更新**：2026-07-29
> **文档定位**：每个功能点覆盖字段级规格、配置项、边界条件、运营策略、数据追踪五个维度
> **适用对象**：产品、开发、测试、运营、销售、客服
> 
> **⚠️ 产品设计基础要求（所有功能开发前必须阅读）：**
> [`PRODUCT-DESIGN-PRINCIPLES.md`](PRODUCT-DESIGN-PRINCIPLES.md) 定义了每页每按钮必须有 `[?]` 帮助说明等底层设计原则，**所有 PRD/SPEC 在进入开发前必须满足**。

## 相关文档索引

> 🎯 **核心流程泳道图**：[`docs/flowcharts/`](flowcharts/) — 6 份泳道图覆盖充值、提现双审、实名审核、供应商状态切换、自动对账、代理晋升全流程。
> 每个泳道图包含 sequenceDiagram + 关键决策点 + 异常场景分析
> 📉 **数据字典**：[`docs/data-dictionary.md`](data-dictionary.md) — 覆盖 19 项枚举定义 + 13 张核心表字段说明 + 业务规则与约束
> 📗 **API 参考手册**：[`docs/api-reference.md`](api-reference.md) — 面向开发者的 API 文档，含认证/模型/Key/余额/日志/通知/错误码/WebSocket/最佳实践
> 🧪 **测试用例与验收标准**：[`docs/test-cases.md`](test-cases.md) — 180+ 条测试用例覆盖 P0/P1/P2 级别，含功能/集成/边界/异常全场景
> 🗄🔧 **前端路由结构**：[`docs/frontend-routes.md`](frontend-routes.md) — 87+ 页面路由总览、3 种布局结构、组件树、公共组件库
> 🛡 **部署运维手册**：[`docs/ops-guide.md`](ops-guide.md) — 服务器清单、部署流程、PM2/Nginx 配置、备份策略、故障排查、安全配置
> 📵 **运营手册（SOP）**：[`docs/ops-manual.md`](ops-manual.md) — 日常检查清单、用户/代理/财务/安全操作 SOP、客服 FAQ
> 🎨🔧 **系统架构概览**：[`docs/architecture.md`](architecture.md) — 系统架构图、部署架构、模块依赖、数据流、安全架构

---

## PRD 章节导航

| 章节 | 文档 | 深化参考 |
|------|------|---------|
| **§1** 平台定位与运营模型 | [`PRD-概览与运营模型.md`](PRD-概览与运营模型.md) | [`ref-1-operational-summary.md`](ref-1-operational-summary.md) |
| **§2** 用户体系 | [`PRD-用户体系.md`](PRD-用户体系.md) | [`ref-2.1-roles-permissions.md`](ref-2.1-roles-permissions.md) + [`ref-2.2-user-dashboard.md`](ref-2.2-user-dashboard.md) + [`ref-2.2.2-model-center.md`](ref-2.2.2-model-center.md) + [`ref-2.2.3-api-keys.md`](ref-2.2.3-api-keys.md) + [`ref-2.2.4-call-logs.md`](ref-2.2.4-call-logs.md) + [`ref-2.2.6-recharge.md`](ref-2.2.6-recharge.md) + [`ref-2.2.8-redemption-invoices.md`](ref-2.2.8-redemption-invoices.md) |
| **§3** 代理商体系 | [`PRD-代理商体系.md`](PRD-代理商体系.md) | [`ref-3-agent-system.md`](ref-3-agent-system.md) |
| **§4** 管理后台 | [`PRD-管理后台.md`](PRD-管理后台.md) | [`ref-4.1-admin-dashboard.md`](ref-4.1-admin-dashboard.md) + [`ref-4.2-user-management.md`](ref-4.2-user-management.md) + [`ref-4.3-vendor-model.md`](ref-4.3-vendor-model.md) + [`ref-4.4-finance.md`](ref-4.4-finance.md) + [`ref-4.5-marketing.md`](ref-4.5-marketing.md) + [`ref-4.6-security.md`](ref-4.6-security.md) + [`ref-4.7-monitor-logs.md`](ref-4.7-monitor-logs.md) + [`ref-4.8-system-config.md`](ref-4.8-system-config.md) + [`ref-4.9-report-testing.md`](ref-4.9-report-testing.md) + [`ref-4.10-vendor-self-service.md`](ref-4.10-vendor-self-service.md) + [`ref-4.10-user-segmentation.md`](ref-4.10-user-segmentation.md) + [`ref-4.11-ticketing.md`](ref-4.11-ticketing.md) + [`ref-4.12-dashboard-pro.md`](ref-4.12-dashboard-pro.md) + [`ref-4.13-operation-timeline.md`](ref-4.13-operation-timeline.md) + [`ref-4.14-report-push.md`](ref-4.14-report-push.md) + [`ref-4.14.5-notification-rules.md`](ref-4.14.5-notification-rules.md) + [`ref-4.15-vendor-settlement.md`](ref-4.15-vendor-settlement.md) + [`ref-4.16-resource-placement.md`](ref-4.16-resource-placement.md) + [`ref-4.17-template-library.md`](ref-4.17-template-library.md) + [`ref-4.18-kpi-drill-healthcheck.md`](ref-4.18-kpi-drill-healthcheck.md) + [`ref-4.19-open-api-platform.md`](ref-4.19-open-api-platform.md) |
| **§5** 核心引擎 | [`PRD-核心引擎.md`](PRD-核心引擎.md) | [`ref-5.1-routing.md`](ref-5.1-routing.md) + [`ref-5.2-billing.md`](ref-5.2-billing.md) + [`ref-5.3-rate-limiter.md`](ref-5.3-rate-limiter.md) + [`ref-5.4-alert-rules.md`](ref-5.4-alert-rules.md) + [`ref-5.5-open-api-platform.md`](ref-5.5-open-api-platform.md) + [`ref-5.5-user-quota-budget.md`](ref-5.5-user-quota-budget.md) + [`ref-5.6-auto-ops.md`](ref-5.6-auto-ops.md) + [`ref-5.7-load-test-design.md`](ref-5.7-load-test-design.md) |
| **§6** Portal 门户 | [`PRD-Portal门户.md`](PRD-Portal门户.md) | [`ref-6-portal.md`](ref-6-portal.md) |
| **§7** 非功能需求 | [`PRD-非功能需求.md`](PRD-非功能需求.md) | [`ref-7-nfr.md`](ref-7-nfr.md) |
| **§8** 运营增长模块 | [`PRD-运营增长模块.md`](PRD-运营增长模块.md) | — |
| **§9** 财务模块增强 | [`PRD-财务模块增强.md`](PRD-财务模块增强.md) → **⚠️ 已废弃，功能合并至 §29** | — |
| **§10** 客服支撑模块 | [`PRD-客服支撑模块.md`](PRD-客服支撑模块.md) | — |
| **§11** 业务员支撑 | [`PRD-业务员支撑.md`](PRD-业务员支撑.md) | — |
| **§12** 系统管理员支撑 | [`PRD-系统管理员支撑.md`](PRD-系统管理员支撑.md) | — |
| **§13** 数据迁移方案 | [`PRD-数据迁移方案.md`](PRD-数据迁移方案.md) | — |
| **§14** 错误码与异常处理规范 | [`PRD-错误码规范.md`](PRD-错误码规范.md) | — |
| **§15** 前端组件库规范 | [`PRD-组件库规范.md`](PRD-组件库规范.md) | — |
| **§16** 第三方集成文档 | [`PRD-第三方集成.md`](PRD-第三方集成.md) | — |
| **§17** 产品迭代路线图 | [`PRD-产品路线图.md`](PRD-产品路线图.md) | — |
| **§18** 用户端体验增强 | [`PRD-用户端体验增强.md`](PRD-用户端体验增强.md) | — |
| **§19** 代理商支撑增强 | [`PRD-代理商支撑增强.md`](PRD-代理商支撑增强.md) | — |
| **§20** 用户端安全与预算增强 | — | [`SPEC-§20-用户端安全与预算增强.md`](SPEC-§20-用户端安全与预算增强.md) — 消费预算/熔断、2FA（后管+用户双设定）、设备管理、Key 权限控制、登录异常检测展示 |
| **§21** Portal 门户增强 | — | [`SPEC-§21-Portal门户增强.md`](SPEC-§21-Portal门户增强.md) — SEO 优化、Blog/Changelog、帮助中心、联系我们/销售咨询、价格计算器、产品更新通知 |
| **§22** 用户端体验增强 | — | [`SPEC-§22-用户端体验增强.md`](SPEC-§22-用户端体验增强.md) — Onboarding 向导、仪表盘增强（成本预估/异常警告/账单周期/实时活动流/数据导出）、用户端 Playground、Webhook 配置、第三方登录、通知偏好增强、API Key 操作日志、邀请机制、用量对比分析、错误码自助排查、批量操作、统一数据导出 |
| **§23** 系统级能力增强 | — | [`SPEC-§23-系统级能力增强.md`](SPEC-§23-系统级能力增强.md) — 操作审计追踪增强、全局搜索 Cmd+K、快捷键支持、i18n 架构、移动端适配 |
| **§24** 代理商增强 | — | [`SPEC-§24-代理商增强.md`](SPEC-§24-代理商增强.md) — 邀请裂变、素材库、业绩排行榜、客户预警、多级佣金、自定义定价 |
| **§25** 供应商增强 | — | [`SPEC-§25-供应商增强.md`](SPEC-§25-供应商增强.md) — 结算对账、公告通知、性能排行榜、自助结算 |
| **§26** 工单系统 | — | [`SPEC-§26-工单系统.md`](SPEC-§26-工单系统.md) — 用户端工单创建/查看/回复、客服端工单队列/Kanban/分配流转、搜索筛选、统计、满意度评价 |
| **§27** 在线客服与客服效能 | — | [`SPEC-§27-在线客服与客服效能.md`](SPEC-§27-在线客服与客服效能.md) — 排队机制、客服状态管理、自动分配、预设消息、已读回执、转工单、历史记录、绩效统计、操作审计 |
| **§28** 智能客服辅助与测试工具 | — | [`SPEC-§28-智能客服辅助与测试工具.md`](SPEC-§28-智能客服辅助与测试工具.md) — 意图识别、知识推荐、异常自动诊断、用户视角查看、模拟调用、临时测试 Key |
| **§29** 资金与对账管理 | — | [`SPEC-§29-资金与对账管理.md`](SPEC-§29-资金与对账管理.md) — 资金流水、资金账户管理、对账差异处理工作台、财务锁账与结转、资金报表中心、逾期管理、多币种结算 |

> 深化文档总规模：**18 份深化参考文献（~360 KB）** + **19 份 PRD 章节文档（~1 MB）** + **11 份新增 SPEC 文档（§20-§30）**，覆盖全部章节。
