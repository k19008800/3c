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
| **§9** 财务模块增强 | [`PRD-财务模块增强.md`](PRD-财务模块增强.md) → **⚠️ 拆分迁移：§9.1-9.4 合并至 §29，§9.5/§9.6 保留独立模块** | [`SPEC-§9-财务模块增强（拆分迁移中）.md`](SPEC-§9-财务模块增强（拆分迁移中）.md) |
| **§10** 客服支撑模块 | [`PRD-客服支撑模块.md`](PRD-客服支撑模块.md) | [`ref-10.1-support-workbench.md`](ref-10.1-support-workbench.md) + [`ref-10.2-knowledge-base.md`](ref-10.2-knowledge-base.md) + [`ref-10.3-help-center.md`](ref-10.3-help-center.md) + [`ref-10.4-quick-reply.md`](ref-10.4-quick-reply.md) + [`ref-10.5-user-timeline.md`](ref-10.5-user-timeline.md) |
| **§11** 业务员支撑 | [`PRD-业务员支撑.md`](PRD-业务员支撑.md) | [`ref-11.1-crm.md`](ref-11.1-crm.md) + [`ref-11.2-leads.md`](ref-11.2-leads.md) + [`ref-11.3-follow-up.md`](ref-11.3-follow-up.md) + [`ref-11.4-opportunity.md`](ref-11.4-opportunity.md) + [`ref-11.5-performance.md`](ref-11.5-performance.md) + [`ref-11.6-quote-contract.md`](ref-11.6-quote-contract.md) + [`ref-11.7-sales-knowledge.md`](ref-11.7-sales-knowledge.md) + [`ref-11.8-team-collaboration.md`](ref-11.8-team-collaboration.md) |
| **§12** 系统管理员支撑 | [`PRD-系统管理员支撑.md`](PRD-系统管理员支撑.md) | [`ref-12.1-audit-console.md`](ref-12.1-audit-console.md) + [`ref-12.2-db-panel.md`](ref-12.2-db-panel.md) + [`ref-12.3-cache-manager.md`](ref-12.3-cache-manager.md) + [`ref-12.4-task-scheduler.md`](ref-12.4-task-scheduler.md) + [`ref-12.5-log-viewer.md`](ref-12.5-log-viewer.md) + [`ref-12.6-health-dashboard.md`](ref-12.6-health-dashboard.md) + [`ref-12.7-change-plan.md`](ref-12.7-change-plan.md) + [`ref-12.8-version-manager.md`](ref-12.8-version-manager.md) |
| **§13** 数据迁移方案 | [`PRD-数据迁移方案.md`](PRD-数据迁移方案.md) | — |
| **§14** 错误码与异常处理规范 | [`PRD-错误码规范.md`](PRD-错误码规范.md) | — |
| **§15** 前端组件库规范 | [`PRD-组件库规范.md`](PRD-组件库规范.md) | — |
| **§16** 第三方集成文档 | [`PRD-第三方集成.md`](PRD-第三方集成.md) | [`ref-16.3-sms.md`](ref-16.3-sms.md) + [`ref-16.4-oss.md`](ref-16.4-oss.md) |
| **§17** 产品迭代路线图 | [`PRD-产品路线图.md`](PRD-产品路线图.md) | — |
| **§18** 用户端体验增强 | [`PRD-用户端体验增强.md`](PRD-用户端体验增强.md) | — |
| **§19** 代理商支撑增强 | [`PRD-代理商支撑增强.md`](PRD-代理商支撑增强.md) | — |
| **§20** 用户端安全与预算增强 | — | [`SPEC-§20-用户端安全与预算增强.md`](SPEC-§20-用户端安全与预算增强.md) — 消费预算/熔断、2FA（后管+用户双设定）、设备管理、Key 权限控制、登录异常检测展示 |
| **§21** Portal 门户增强 | — | [`SPEC-§21-Portal门户增强.md`](SPEC-§21-Portal门户增强.md) — SEO 优化、Blog/Changelog、帮助中心、联系我们/销售咨询、价格计算器、产品更新通知 |
| **§22** 用户端体验增强 | — | [`SPEC-§22-用户端体验增强.md`](SPEC-§22-用户端体验增强.md) — Onboarding 向导、仪表盘增强（成本预估/异常警告/账单周期/实时活动流/数据导出）、用户端 Playground、Webhook 配置、第三方登录、通知偏好增强、API Key 操作日志、邀请机制、用量对比分析、错误码自助排查、批量操作、统一数据导出 |
| **§23** 系统级能力增强 | — | [`SPEC-§23-系统级能力增强.md`](SPEC-§23-系统级能力增强.md) — 操作审计追踪增强、全局搜索 Cmd+K、快捷键支持、i18n 架构、移动端适配 |
| **§24** 代理商增强 | — | [`SPEC-§24-代理商增强.md`](SPEC-§24-代理商增强.md) — 邀请裂变、素材库、业绩排行榜、客户预警、多级佣金、自定义定价 |
| **§25** 供应商增强 | — | [`SPEC-§25-供应商增强.md`](SPEC-§25-供应商增强.md) — 结算对账、公告通知、性能排行榜、自助结算（详见下方边界说明）|
| **§26** 工单系统 | — | [`SPEC-§26-工单系统.md`](SPEC-§26-工单系统.md) — 用户端工单创建/查看/回复、客服端工单队列/Kanban/分配流转、搜索筛选、统计、满意度评价 |
| **§27** 在线客服与客服效能 | — | [`SPEC-§27-在线客服与客服效能.md`](SPEC-§27-在线客服与客服效能.md) — 排队机制、客服状态管理、自动分配、预设消息、已读回执、转工单、历史记录、绩效统计、操作审计 |
| **§28** 智能客服辅助与测试工具 | — | [`SPEC-§28-智能客服与测试工具.md`](SPEC-§28-智能客服与测试工具.md) — 意图识别、知识推荐、异常自动诊断、用户视角查看、模拟调用、临时测试 Key |
| **§29** 资金与对账管理 | — | [`SPEC-§29-资金与对账管理.md`](SPEC-§29-资金与对账管理.md) — 资金流水、资金账户管理、对账差异处理工作台、财务锁账与结转、资金报表中心、逾期管理、多币种结算 |

> 深化文档总规模：**18 份深化参考文献（~360 KB）** + **19 份 PRD 章节文档（~1 MB）** + **11 份新增 SPEC 文档（§20-§30）**，覆盖全部章节。

---

## 运营视角补充文档索引

> **补充时间**：2026-07-30 — 扫描 64 篇文档发现 46 项缺失，P0(20项)+P1(22项)+P2(3项) 全部覆盖

| 补充类型 | 文件 | 内容 |
|---------|------|------|
| **P0 核心补充** | `ref-5.2-billing.md` §10 | 计费预扣回滚、并发扣款、异常干预 |
| | `ref-4.3-vendor-model.md` §7 | 供应商异常降级、上下线影响、Key 耗尽 |
| | `SPEC-§29-资金与对账管理.md` §29.3-29.4 | 全链路监控、财务锁账 SOP |
| | `ref-4.8-system-config.md` §5 | 配置变更分级审批、回滚 |
| | `ref-3-agent-system.md` §7 | 佣金异常修复、提现失败、降级影响 |
| | `ref-5.3-rate-limiter.md` §10 | 限流熔断通知、系统降级 |
| | `ref-2.2.6-recharge.md` §7 | 充值回调重试、对公转账、渠道熔断 |
| | `ref-4.2-user-management.md` §11 | 用户禁用数据一致性 |
| | `ops-补充-数据迁移运营影响.md` | 灰度发布、回滚、检查清单 |
| **P1 补充** | `ref-4.6-security.md` §12 | 安全事件 SOP、规则变更回溯 |
| | `SPEC-§27-在线客服与客服效能.md` §27.4 | 客服 SLA、排班、效能指标 |
| | `ref-4.5-marketing.md` §8 | 活动冲突、预算保护、评估标准 |
| | `ops-manual.md` §9-§12 | 日报定义、一致性检查、数据流地图、SOP 索引 |
| | `ref-4.3-vendor-model.md` §8 | 入驻审核、价格审批 |
| | `ref-3-agent-system.md` §8 | 批量审核、对账、封顶、结算周期 |
| | `ref-5.2-billing.md` §8 | 计费 SLA、精度、T+1 边界 |
| | `ops-补充-客服升级与用户通知.md` | 升级体系、通知策略 |
| **Gap 建议** | `ref-5.4-alert-rules.md` §6 | 各模块 API 告警阈值 |
| | `ops-manual.md` §11 | 跨模块数据流地图 |

> 📌 **运营手册（SOP）**：[`ops-manual.md`](ops-manual.md) 是日常操作入口，包含每日检查清单、SOP 快速索引、异常流程汇总
> 📌 **Gap 分析报告**：[`docs/gap/gap-analysis-report.md`](gap/gap-analysis-report.md) — 完整审计结果
> 📌 **边界条件补充文档**：[`docs/boundary-supplement.md`](boundary-supplement.md) — 覆盖 16 个缺乏独立边界条件的模块，总计 130 个边界条件场景

---

## 文档边界说明与待办

### §25 vs ref-4.10（供应商增强 vs 供应商自助管理）

| 维度 | §25 SPEC | ref-4.10-vendor-self-service.md |
|------|----------|--------------------------------|
| 视角 | **供应商自助端**（供应商登录后查看结算/通知/排行榜/自助结算） | **管理后台端**（管理员配置/管理供应商接入） |
| 内容 | 结算对账查看、公告通知、性能排行榜（供应商视角） | 供应商入驻、模型配置、Key 管理、自助仪表盘（管理视角） |
| 数据源 | vendor_settlements / vendor_notifications / vendor_stats | vendors / vendor_models / vendor_api_keys / vendor_health |
| **状态** | 两者同一数据源不同视角，**计划后续合并为一** |

**待办**：开发 §25 时需对齐 ref-4.10 中的已有数据表结构和 API，避免重复造轮。

### §9 财务模块增强（拆分迁移状态）

- §9.1/9.2/9.3/9.4 → 已合并至 §29 资金与对账管理
- **§9.5 退款自动化** / **§9.6 税票统计看板** → 保留为独立模块，参见[SPEC-§9（拆分迁移中）](SPEC-§9-财务模块增强（拆分迁移中）.md)
- ✅ 已为 §9.5 和 §9.6 创建独立深化文档：[ref-9.5-refund.md](ref-9.5-refund.md) / [ref-9.6-tax-invoice.md](ref-9.6-tax-invoice.md)

### 缺少深化文档的模块（待办）

以下模块 PRD 中已有较完整规格，但**缺少独立 ref 深化文档（API/Schema/Props 级）**，建议分批补写：

| 模块 | P0 级优先补写 | 本次已补 | 剩余待补 |
|------|--------------|---------|---------|
| §10 客服支撑 | 客服工作台、知识库、帮助中心、快捷回复模板、用户时间线 | ✅ 5 份全部完成 | — |
| §11 业务员支撑 | CRM、线索管理、跟进提醒、商机、业绩看板、报价合同、销售知识库、团队协作 | ✅ 8 份全部完成 | — |
| §12 系统管理 | 审计控制台、数据库面板、缓存管理、任务调度、日志查看器、健康检查、变更计划、版本管理 | ✅ 8 份全部完成 | — |

今次已补 6 份（P0 级），标注 ✅。

### 其他逻辑性问题

1. ✅ **SPEC-§20 交叉引用** → 已修复：§20 对接关系表中 [`§18`](SPEC-§18-用户端体验增强.md) 和 [`§14`](SPEC-§14-错误码规范.md) 补充了文档链接
2. **§33.3 用户数据导出** → GDPR 合规功能规格较简（约 1 页），建议扩展管理员审核流程细节和 ZIP 内容结构
3. ✅ **浮动章节 A/B Testing** → 已创建 [SPEC-AB-testing.md](SPEC-AB-testing.md)（需求规格文档）
4. ✅ **短信服务** 和 **OSS 文件上传** → 已创建 [ref-16.3-sms.md](ref-16.3-sms.md) 和 [ref-16.4-oss.md](ref-16.4-oss.md)
5. **SPEC 模板化 `[?]` 帮助** → 所有 SPEC 底部的 `[?]` 内容均为通用占位符，未针对具体功能定制。建议在开发前替换为功能定制内容
