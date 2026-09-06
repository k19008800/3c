# 3cloud 产品文档体系

> 最后更新：2026-08-31
>
> **正式准入入口**：[`00-index/README.md`](00-index/README.md)（治理规则见 [`00-index/governance-policy.md`](00-index/governance-policy.md)，五大资金主题交付追踪见 [`00-index/feature-package-matrix.md`](00-index/feature-package-matrix.md)，全量清单见 [`00-index/document-inventory.md`](00-index/document-inventory.md)）；只有满足治理准入条件的 `approved`/`accepted` 文档可作为开发与验收依据。
>
> **既有来源资料**：从 [`PRD-README.md`](PRD-README.md) 开始，它是运营级需求总纲（来源/需求资料，非唯一权威）。

---

## 目录结构

```
docs/
├── PRD-README.md              ← 来源总纲：运营级需求（非唯一权威，正式以 00-index 为准）
│
├── ref-1-operational-summary.md    ← 深化：运营总纲（KPI + 用户分层）
├── ref-2.1-roles-permissions.md    ← 深化：角色权限体系（Bitset 矩阵）
├── ref-2.2-user-dashboard.md       ← 深化：用户端仪表盘
├── ref-2.2.2-model-center.md       ← 深化：模型中心（分类/Playground/对比）
├── ref-2.2.3-api-keys.md           ← 深化：API Key 管理（创建/权限/过期/统计）
├── ref-2.2.4-call-logs.md          ← 深化：调用日志（筛选/导出/异常分析）
├── ref-2.2.6-recharge.md           ← 深化：充值中心（支付/对公转账/优惠/明细）
├── ref-2.2.8-redemption-invoices.md ← 深化：兑换码与发票（兑换/开票/审核）
├── ref-3-agent-system.md           ← 深化：代理商体系（等级/佣金/提现/结算）
├── ref-4.1-admin-dashboard.md      ← 深化：管理总览看板
├── ref-4.2-user-management.md     ← 深化：用户管理（列表/详情/批量/实名/导入导出）
├── ref-4.3-vendor-model.md         ← 深化：渠道与模型管理
├── ref-4.4-finance.md              ← 深化：财务管理（定价/充值/发票/对账）
├── ref-4.5-marketing.md            ← 深化：营销运营（活动/兑换码/公告）
├── ref-4.6-security.md             ← 深化：安全风控（5 层架构）
├── ref-4.7-monitor-logs.md         ← 深化：监控日志（7 种日志类型）
├── ref-4.8-system-config.md        ← 深化：系统配置（版本/快照/审批）
├── ref-4.9-report-testing.md       ← 深化：报告测试（导出/自定义报表）
├── ref-4.10-vendor-self-service.md ← 深化：渠道自助管理（入驻/仪表盘/模型/结算）
├── ref-5.1-routing.md              ← 深化：智能路由系统
├── ref-5.2-billing.md              ← 深化：计费结算精化（价格层级/实时计费/账单/对账）
├── ref-5.3-rate-limiter.md         ← 深化：限流引擎（四级限流/算法/配额/可视化）
├── ref-5.4-alert-rules.md          ← 深化：告警规则配置
├── ref-6-portal.md                  ← 深化：Portal 门户（首页/模型/定价/文档/状态页）
├── ref-7-nfr.md                    ← 深化：非功能需求（性能/安全/可用性/扩展性）
│
├── api-reference.md                ← 📡 API 参考手册（面向开发者，含认证/模型/错误码/WebSocket）
│   └── 2026-08-17：独立 API 域名 api.&lt;host&gt;（OpenAI base_url=/v1 + Anthropic base_url=/anthropic，后台可配置 api_domain）
├── test-cases.md                   ← 🧪 测试用例与验收标准（180+ 条，P0/P1/P2 全覆盖）
├── frontend-routes.md              ← 🗺️ 前端路由结构（87+ 页面、5 布局、组件树）
├── ops-guide.md                    ← 🔧 部署运维手册（环境/部署/备份/监控/故障排查）
├── ops-manual.md                   ← 📋 运营手册 SOP（用户/代理/财务/安全操作/FAQ）
├── ops-business-plan.md            ← 📈 平台运营方案与系统迭代建议（拓客/定价/组织架构/P0-P2迭代计划）
├── architecture.md                 ← 🏗️ 系统架构概览（架构图/部署/模块依赖/数据流）
│
├── 注：§8 运营增长模块（P0）已内嵌于 PRD-README.md §8，含 4 项完整功能规格
├── 包括：代理兑换码配额、充值自动赠送、用户分群推送、自动化流失召回
│
├── 注：§9 财务模块增强（P0-P1）已内嵌于 PRD-README.md §9，含 6 项完整功能规格
├── 包括：财务总账、月度报告、日报推送、授信额度、退款自动化、税票统计
│
├── 注：§10 客服支撑模块（P0-P1）已内嵌于 PRD-README.md §10，含 6 项完整功能规格
├── 包括：客服工作台、知识库、帮助中心、快捷回复、在线客服、用户时间线
│
├── 注：§11 业务员支撑模块（P0-P2）已内嵌于 PRD-README.md §11，含 8 项完整功能规格
├── 包括：CRM 客户管理、线索管理、跟进提醒、商机报价、业绩看板、合同管理、销售知识库、团队协作
│
├── 注：§12 系统管理员支撑模块（P0-P2）已内嵌于 PRD-README.md §12，含 8 项完整功能规格
├── 包括：操作审计、数据库面板、缓存管理、任务调度、日志查看、健康检查、变更计划、版本管理
│
├── 注：§13 数据迁移方案（P0-P2）已内嵌于 PRD-README.md §13
├── 注：§14 错误码与异常处理规范（P0）已内嵌于 PRD-README.md §14
├── 注：§15 前端组件库规范（P1）已内嵌于 PRD-README.md §15
├── 注：§16 第三方集成文档（P1）已内嵌于 PRD-README.md §16
├── 注：§17 产品迭代路线图（规划）已内嵌于 PRD-README.md §17
│
├── 注：§18 用户端体验增强（P0-P2）已内嵌于 PRD-README.md §18，含 8 项完整功能规格
├── 包括：API调试工具、预算控制、Onboarding、账单分析、通知偏好、安全中心、状态页、SDK
│
├── 注：§19 代理商支撑增强（P0-P2）已内嵌于 PRD-README.md §19，含 6 项完整功能规格
├── 包括：客户报备、财务中心、客户消费明细、消息通知、等级权益、移动端适配
│
└── sprint-1/                  ← Sprint 细化：账号注销 + 结算对账
├── data-dictionary.md              ← 📖 数据字典（19 枚举 + 13 表字段 + 业务规则）
│
├── flowcharts/                     ← 🎨 核心业务流程泳道图（6 份）
│   ├── README.md
│   ├── 01-recharge.md
│   ├── 02-agent-withdraw.md
│   ├── 03-real-name-review.md
│   ├── 04-vendor-status-switch.md
│   ├── 05-auto-reconciliation.md
│   └── 06-agent-upgrade.md
│
├── sprint-1/                  ← Sprint 细化：账号注销 + 结算对账
│
└── _archive/                  ← 📁 旧版文档，保留可追溯
    ├── upgrade/               ← 18 份功能方案（P0/P1/P2 功能设计，已实现）
    ├── test-reports/          ← 14 份路由审计/构建报告（一次性的）
    ├── DRD 文档 / 旧版 PRD / 方案 / ...（42 份）
    └── 共 79 份，不参与后续开发
```

## 有效文档认定规则

> ⚠️ **2026-08-30 修订**：文档体系正在向正式化迁移。当前存在两套文档，其权威地位如下：
>
> - **正式（canonical）体系**：以 `00-index/README.md` 为**唯一准入入口**，其 `document-map.md`、`document-inventory.md` 登记全部正式文档。只有 `approved` 正文与 `accepted` ADR 可作为开发与验收依据。
> - **既有来源体系**：`PRD-README.md` 及其引用的 `ref-*.md` 仍是有效的**来源/需求资料**，但不再作为唯一权威；需经迁移进入正式体系后才计入门禁。
> - 二者**并存但层级分明**，禁止以 `README.md`（本文档）或 `PRD-README.md` 的引用范围覆盖正式体系的准入判定。

具体判定规则（详见 `00-index/README.md`）：

- **准入依据**：`00-index/` 的 `document-map.md`（第一批主题追溯）与 `document-inventory.md`（全量当前文档清单）。
- **补充规格**：`supplement/`（01–09，重写前补充规格）已纳入 `document-inventory.md`，登记其补充对象与状态；在完成登记与评审前仍视为 `draft` 来源资料。
- **Sprint 细化**：`sprint-1/` 是独立的 Sprint 细化目录，由项目迭代管理，已纳入 `document-inventory.md`。
- **恢复草稿**：`_recovered/` 是临时工作区，非 canonical 需求源（自证见 `_recovered/*.notes.md`）；其内容须经人工恢复裁决并升格正式文档后，方可作为需求依据。
- 不在上述清单范围的文件 → 应移入 `_archive/` 或登记到 `document-inventory.md`。

## 新增文档规范

- 命名格式：`ref-{章节}-{功能名}.md`（如 `ref-4.6-security.md`）
- 内容必须含：Drizzle Schema / API 接口 / 前端组件 Props / 交叉引用
- 创建后必须在 `00-index/document-inventory.md` 登记，并在 `PRD-README.md` 或对应正式章节添加链接

## 常见问题

> **Q：旧升级方案（upgrade/）还有参考价值吗？**
> A：功能已全部实现，不再作为需求文档。如需追溯原始需求，到 `_archive/upgrade/` 查看。

> **Q：测试报告还用维护吗？**
> A：不用。一次性的路由枚举和性能报告，代码已经迭代后它们不再准确。

> **Q：如何确认我在看的最新文档？**
> A：以 `00-index/README.md` 为唯一准入入口，对照其 `document-map.md` 与 `document-inventory.md`。`PRD-README.md` + `ref-*.md` 为既有来源资料；两者层级以正式体系为准。
