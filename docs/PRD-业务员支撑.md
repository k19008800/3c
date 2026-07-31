# 3cloud（3C）AI Token 聚合平台 — 十一、业务员支撑模块

> **适用对象**：销售/业务员/代理商 — 负责拓客、客户维系、签约成交的角色
> **状态**：P0-P1 新增需求

### 11.1 客户关系管理（CRM）

#### 背景

业务员管理名下客户，目前只能去用户管理列表翻查，没有一个"我的客户"专属视图。客户状态（试用/活跃/流失）、联系记录、标签等信息全部缺失，业务员对客户情况全靠脑子记。

#### 功能规格

| 模块 | 说明 |
|------|------|
| 我的客户列表 | 只看归属自己的客户，展示客户名/邮箱/注册时间/最近活跃/消费总额/当前余额/状态 |
| 客户标签 | 支持多标签：企业客户/开发者/高价值/需跟进/流失预警/已签约 |
| 联系记录 | 每次与客户沟通后记录：时间/方式（电话/微信/邮件/面谈）/内容摘要/下次跟进时间 |
| 客户状态 | 意向→试用→活跃→沉默→流失，支持手动变更 |
| 客户详情页 | 整合客户信息：基本信息+消费趋势+调用记录+工单历史+联系记录+合同状态 |

#### 数据表设计

```typescript
// customer_notes — 客户联系记录
export const customerNotes = pgTable("customer_notes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  salespersonId: integer("salesperson_id").notNull().references(() => users.id),
  contactMethod: varchar("contact_method", { length: 20 }).notNull(), // phone | wechat | email | meeting | other
  summary: text("summary").notNull(),
  nextFollowUp: timestamp("next_follow_up", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// customer_tags — 客户标签
export const customerTags = pgTable("customer_tags", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  tag: varchar("tag", { length: 20 }).notNull(),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// customer_status_log — 客户状态变更记录表
export const customerStatusLog = pgTable("customer_status_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  fromStatus: varchar("from_status", { length: 20 }),
  toStatus: varchar("to_status", { length: 20 }).notNull(),
  changedBy: integer("changed_by").notNull().references(() => users.id),
  reason: varchar("reason", { length: 200 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 客户状态枚举：lead | trial | active | silent | churned
```

#### API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/agent/customers` | 名下客户列表（支持筛选/搜索） | 代理/销售 |
| `GET` | `/api/v1/agent/customers/:userId` | 客户详情 | 代理/销售 |
| `GET` | `/api/v1/agent/customers/:userId/stats` | 客户消费统计 | 代理/销售 |
| `POST` | `/api/v1/agent/customers/:userId/notes` | 添加联系记录 | 代理/销售 |
| `GET` | `/api/v1/agent/customers/:userId/notes` | 联系记录列表 | 代理/销售 |
| `PATCH` | `/api/v1/agent/customers/:userId/status` | 变更客户状态 | 代理/销售 |
| `POST` | `/api/v1/agent/customers/:userId/notes/:id` | 更新联系记录 | 代理/销售 |
| `POST` | `/api/v1/agent/customers/:userId/tags` | 设置标签 | 代理/销售 |
| `DELETE` | `/api/v1/agent/customers/:userId/tags/:tag` | 删除标签 | 代理/销售 |

#### 前端变更

| 页面 | 变更 |
|------|------|
| 代理端 → 新增"我的客户"入口 | 客户列表页，支持筛选/搜索/标签过滤 |
| 代理端 → 客户详情 | 基本信息+消费趋势+调用记录+工单历史+联系记录+状态变更 |
| 代理端 → 客户详情 → 联系记录 | 新增记录表单+历史列表+下次跟进时间设置 |

---

### 11.2 线索管理

#### 背景

业务员通过各种渠道获取潜在客户线索（官网注册、展会、朋友介绍、主动拓客），但目前没有系统化记录，线索跟进全靠 Excel 或微信聊天记录，容易遗漏和丢失。

#### 功能规格

| 模块 | 说明 |
|------|------|
| 线索录入 | 手动录入：姓名/公司/电话/邮箱/微信/需求描述/来源 |
| 线索来源 | 官网注册/朋友介绍/展会/主动拓客/社交媒体/电话陌拜/其他 |
| 线索分配 | 管理员可将线索分配给指定业务员 |
| 线索状态 | 新线索→已联系→意向客户→已成交→无效（含原因） |
| 线索转换 | 客户注册后，自动关联到已有线索 |

#### 数据表设计

```typescript
// leads — 线索
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  company: varchar("company", { length: 100 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 100 }),
  wechat: varchar("wechat", { length: 50 }),
  requirement: text("requirement"),
  source: varchar("source", { length: 20 }).notNull().default("manual"),
  status: varchar("status", { length: 20 }).notNull().default("new"),
  // new | contacted | interested | converted | invalid
  invalidReason: varchar("invalid_reason", { length: 100 }),
  assignedTo: integer("assigned_to").references(() => users.id),
  linkedUserId: integer("linked_user_id").references(() => users.id),
  // 如果线索客户已注册，关联到用户
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 索引：assignedTo + status 联合查询
```

#### API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `POST` | `/api/v1/admin/leads` | 录入线索 | 管理员/业务员 |
| `GET` | `/api/v1/admin/leads` | 线索列表（支持状态/来源/分配人筛选） | 管理员/业务员 |
| `PATCH` | `/api/v1/admin/leads/:id` | 更新线索信息/状态 | 管理员/业务员 |
| `POST` | `/api/v1/admin/leads/:id/assign` | 分配线索 | 管理员 |
| `GET` | `/api/v1/agent/leads` | 我的线索列表 | 业务员 |

#### 前端变更

| 页面 | 变更 |
|------|------|
| 管理后台 → 新增"线索管理"入口 | 线索列表（管理员可见全部，业务员可见自己） |
| 管理后台 → 线索创建 | 录入表单，含来源/需求/分配人 |
| 管理后台 → 线索详情 | 基本信息+跟进记录+状态变更 |
| 代理端 → 新增"我的线索"入口 | 业务员自己名下的线索列表 |

---

### 11.3 客户跟进提醒

#### 背景

业务员手头客户多了以后，容易忘记哪些客户长期没联系。当前系统没有跟进提醒，客户流失往往是从"忘了跟"开始的。

#### 功能规格

| 模块 | 说明 |
|------|------|
| 跟进计划 | 设置客户下次联系时间，到期自动提醒 |
| 超时预警 | 超过 N 天未联系的客户，标记为"待跟进" |
| 跟进列表 | 按"需要今天跟进/本周跟进/已超期"分类展示 |
| 通知方式 | 站内通知 + 可选邮件/短信提醒 |
| 跟进规则 | 管理员可配置：沉默 N 天提醒、连续 N 天无跟进升级 |

#### 数据表设计

复用 `customer_notes` 表的 `nextFollowUp` 字段。新增规则表：

```typescript
// follow_up_rules — 跟进规则配置
export const followUpRules = pgTable("follow_up_rules", {
  id: serial("id").primaryKey(),
  silenceDays: integer("silence_days").notNull().default(14), // 沉默天数触发提醒
  escalationDays: integer("escalation_days").notNull().default(30), // 超期升级天数
  notifyChannels: jsonb("notify_channels").notNull().default(["notification"]),
  // ["notification", "email", "sms"]
  enabled: boolean("enabled").notNull().default(true),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

#### API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/agent/follow-ups` | 我的跟进列表（今日/本周/超期分组） | 业务员 |
| `GET` | `/api/v1/agent/follow-ups/today` | 今日待跟进客户 | 业务员 |
| `PATCH` | `/api/v1/agent/follow-ups/:userId/next` | 设置下次跟进时间 | 业务员 |
| `GET` | `/api/v1/admin/follow-up-rules` | 跟进规则配置 | 管理员 |
| `PATCH` | `/api/v1/admin/follow-up-rules` | 更新跟进规则 | 管理员 |

#### 前端变更

| 页面 | 变更 |
|------|------|
| 代理端 → 首页/侧边栏 | 新增"待跟进"徽标（今日待跟进数量） |
| 代理端 → 新增"跟进提醒"页面 | 按今日/本周/超期分组展示，点击跳转客户详情 |
| 管理后台 → 运营配置 | 跟进规则配置表单 |

---

### 11.4 商机与报价管理

#### 背景

企业客户通常需要定制价格方案，不是直接使用公开定价。业务员当前没有标准化的报价工具，报价靠微信发文字、老板拍脑袋批价格，流程不透明。

#### 功能规格

| 模块 | 说明 |
|------|------|
| 商机创建 | 描述客户需求、预估月消费量、期望折扣率、竞争情况 |
| 商机阶段 | 发现→需求确认→方案→报价→谈判→成交→丢单 |
| 报价生成 | 基于商机自动生成报价单：客户名/模型清单/折扣价/有效期 |
| 报价审批 | 超出业务员权限的折扣 → 提交上级审批 |
| 报价单下载 | 生成 PDF 报价单，可发给客户 |
| 合同模板 | 标准合同模板，替换变量后生成 |

#### 数据表设计

```typescript
// opportunities — 商机
export const opportunities = pgTable("opportunities", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id), // 关联客户（如有）
  leadId: integer("lead_id").references(() => leads.id), // 关联线索
  title: varchar("title", { length: 100 }).notNull(),
  description: text("description"),
  estimatedMonthlyConsumption: numeric("estimated_monthly_consumption", { precision: 14, scale: 4 }),
  expectedDiscount: numeric("expected_discount", { precision: 5, scale: 2 }), // 百分比
  stage: varchar("stage", { length: 20 }).notNull().default("discovery"),
  // discovery | qualification | solution | quotation | negotiation | won | lost
  lostReason: varchar("lost_reason", { length: 100 }),
  expectedAmount: numeric("expected_amount", { precision: 14, scale: 4 }), // 预估年金额
  probability: integer("probability").default(50), // 成交概率 0-100
  salespersonId: integer("salesperson_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// quotations — 报价单
export const quotations = pgTable("quotations", {
  id: serial("id").primaryKey(),
  quotationNo: varchar("quotation_no", { length: 20 }).notNull().unique(), // QT-260728-0001
  opportunityId: integer("opportunity_id").notNull().references(() => opportunities.id),
  customerName: varchar("customer_name", { length: 100 }).notNull(),
  customerContact: varchar("customer_contact", { length: 50 }),
  items: jsonb("items").notNull(), // [{modelId, modelName, standardPrice, discountPrice, unit}]
  totalAmount: numeric("total_amount", { precision: 14, scale: 4 }).notNull(),
  discountRate: numeric("discount_rate", { precision: 5, scale: 2 }),
  validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  // draft | pending_approval | approved | rejected | sent | accepted | expired
  approverId: integer("approver_id").references(() => users.id),
  approvalNote: text("approval_note"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

#### API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `POST` | `/api/v1/agent/opportunities` | 创建商机 | 业务员 |
| `GET` | `/api/v1/agent/opportunities` | 商机列表 | 业务员 |
| `PATCH` | `/api/v1/agent/opportunities/:id` | 更新商机阶段/信息 | 业务员 |
| `POST` | `/api/v1/agent/quotations` | 生成报价单 | 业务员 |
| `GET` | `/api/v1/agent/quotations` | 报价单列表 | 业务员 |
| `GET` | `/api/v1/agent/quotations/:id` | 报价单详情 | 业务员 |
| `GET` | `/api/v1/agent/quotations/:id/download` | 下载报价单 PDF | 业务员 |
| `POST` | `/api/v1/agent/quotations/:id/submit-approval` | 提交审批 | 业务员 |
| `POST` | `/api/v1/admin/quotations/:id/approve` | 审批报价 | 财务/管理员 |
| `POST` | `/api/v1/admin/quotations/:id/reject` | 驳回报价 | 财务/管理员 |

#### 前端变更

| 页面 | 变更 |
|------|------|
| 代理端 → 新增"商机管理"入口 | 商机列表（看板视图：按阶段分组展示） |
| 代理端 → 商机详情 | 客户信息+需求描述+阶段+报价单列表 |
| 代理端 → 新增"报价单"入口 | 报价单列表+创建表单+PDF下载 |
| 管理后台 → 审批中心 | 报价审批待办 |

---

### 11.5 业绩看板

#### 背景

业务员和代理商需要一个专属的业绩看板，实时了解自己的拓客成果。当前代理端仪表盘只有 6 个通用 KPI 卡片，没有针对业务员的销售业绩维度。

#### 功能规格

| 模块 | 说明 |
|------|------|
| 本月业绩概览 | 新增客户数/新增消费额/目标完成率/商机数/成交数 |
| 业绩趋势 | 近 6 个月新增客户数+新增消费额趋势图 |
| 客户构成 | 按客户状态（活跃/沉默/流失）分布饼图 |
| 佣金预估 | 本月名下客户已产生佣金+预估年化佣金 |
| 排名看板 | 同级业务员/代理横向排名（新增客户数、客户消费总额） |
| 目标管理 | 管理员设置月度/季度目标，业务员查看完成进度 |

#### 数据表设计

```typescript
// sales_targets — 销售目标
export const salesTargets = pgTable("sales_targets", {
  id: serial("id").primaryKey(),
  salespersonId: integer("salesperson_id").notNull().references(() => users.id),
  period: varchar("period", { length: 10 }).notNull(), // "2026-07" | "2026-Q3"
  type: varchar("type", { length: 20 }).notNull(), // monthly | quarterly
  newCustomerTarget: integer("new_customer_target").default(0),
  consumptionTarget: numeric("consumption_target", { precision: 14, scale: 4 }).default(0),
  opportunityTarget: integer("opportunity_target").default(0),
  setBy: integer("set_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 唯一约束：(salespersonId, period, type)
```

#### API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/agent/performance/summary` | 本月业绩概览 | 业务员/代理 |
| `GET` | `/api/v1/agent/performance/trends months=6` | 业绩趋势 | 业务员/代理 |
| `GET` | `/api/v1/agent/performance/customer-composition` | 客户构成分析 | 业务员/代理 |
| `GET` | `/api/v1/agent/performance/commission-estimate` | 佣金预估 | 业务员/代理 |
| `GET` | `/api/v1/agent/performance/ranking type=newCustomers` | 排名看板 | 业务员/代理 |
| `POST` | `/api/v1/admin/sales-targets` | 设置销售目标 | 管理员 |
| `GET` | `/api/v1/agent/performance/targets` | 我的目标及完成进度 | 业务员/代理 |

#### 前端变更

| 页面 | 变更 |
|------|------|
| 代理端 → 仪表盘 → 新增"业绩"标签页 | 业绩概览+趋势+客户构成+佣金预估 |
| 代理端 → 新增"排名"页面 | 同级排名列表 |
| 管理后台 → 运营 → 新增"销售目标管理" | 设置/调整业务员月度/季度目标 |

---

### 11.6 合同管理

#### 背景

企业客户合作需要正式合同。当前没有合同管理功能，合同靠线下 Word 文件管理，到期续签、条款变更全凭人工记忆。

#### 功能规格

| 模块 | 说明 |
|------|------|
| 合同模板 | 预置标准合同模板（含条款变量占位符） |
| 合同生成 | 选择模板→填写客户信息/价格/有效期→生成合同 |
| 合同审批 | 合同 → 法务/财务/管理层逐级审批 |
| 电子签章 | 对接电子签章服务（如法大大、上上签） |
| 合同归档 | 已签署合同自动归档，支持 PDF 下载 |
| 到期提醒 | 合同到期前 30/15/7 天自动提醒 |
| 续签管理 | 一键生成续签合同，沿用上一次条款 |

#### 数据表设计

```typescript
// contract_templates — 合同模板
export const contractTemplates = pgTable("contract_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  content: text("content").notNull(), // Markdown 模板，含变量占位符
  variables: jsonb("variables"), // 变量列表 [{name, label, type}]
  version: integer("version").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// contracts — 合同
export const contracts = pgTable("contracts", {
  id: serial("id").primaryKey(),
  contractNo: varchar("contract_no", { length: 30 }).notNull().unique(),
  templateId: integer("template_id").references(() => contractTemplates.id),
  customerId: integer("customer_id").notNull().references(() => users.id),
  customerName: varchar("customer_name", { length: 100 }).notNull(),
  customerContact: varchar("customer_contact", { length: 50 }),
  salespersonId: integer("salesperson_id").notNull().references(() => users.id),
  content: text("content").notNull(), // 生成的合同内容
  variables: jsonb("variables"), // 实际填充的变量值
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  // draft | pending_approval | approved | signed | expired | terminated
  effectiveDate: timestamp("effective_date", { withTimezone: true }),
  expiryDate: timestamp("expiry_date", { withTimezone: true }),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  signMethod: varchar("sign_method", { length: 20 }), // esign | physical | none
  fileUrl: varchar("file_url", { length: 500 }), // 已签署合同文件
  renewalContractId: integer("renewal_contract_id"), // 续签关联
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 索引：status + expiryDate（到期提醒查询）
```

#### API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `POST` | `/api/v1/admin/contract-templates` | 创建合同模板 | 管理员 |
| `GET` | `/api/v1/admin/contract-templates` | 模板列表 | 管理员/业务员 |
| `POST` | `/api/v1/agent/contracts/generate` | 基于模板生成合同 | 业务员 |
| `GET` | `/api/v1/agent/contracts` | 合同列表 | 业务员 |
| `GET` | `/api/v1/agent/contracts/:id` | 合同详情 | 业务员 |
| `GET` | `/api/v1/agent/contracts/:id/download` | 下载合同 PDF | 业务员 |
| `POST` | `/api/v1/agent/contracts/:id/submit-approval` | 提交审批 | 业务员 |
| `POST` | `/api/v1/admin/contracts/:id/approve` | 审批合同 | 法务/管理员 |
| `POST` | `/api/v1/admin/contracts/:id/reject` | 驳回合同 | 法务/管理员 |
| `POST` | `/api/v1/agent/contracts/:id/renew` | 生成续签合同 | 业务员 |

#### 前端变更

| 页面 | 变更 |
|------|------|
| 管理后台 → 新增"合同模板"入口 | 模板列表+创建/编辑 |
| 代理端 → 新增"合同管理"入口 | 合同列表+生成+详情+下载 |
| 管理后台 → 审批中心 | 合同审批待办 |
| 代理端 → 合同详情 | 基本信息+条款展示+审批状态+续签操作 |

---

### 11.7 销售知识库

#### 背景

业务员外拓客时，需要快速查询产品信息、卖点话术、竞品对比，应对客户提问。当前这些信息分散在 PRD 文档里，业务员没有一个移动端或桌面端可以快速查阅的销售工具。

#### 功能规格

| 模块 | 说明 |
|------|------|
| 产品速查 | 产品功能介绍、核心卖点、适用场景 |
| 定价指南 | 各模型定价速查表、折扣策略说明 |
| 竞品对比 | 3cloud vs 官方直连 vs 其他聚合平台 对比表 |
| 常见问答 | 客户常问问题及标准应答 |
| 案例库 | 成功客户案例（行业/规模/解决方案/效果） |
| 搜索 | 全文搜索所有知识库内容 |

#### 数据表设计

```typescript
// sales_knowledge_base — 销售知识库
export const salesKnowledgeBase = pgTable("sales_knowledge_base", {
  id: serial("id").primaryKey(),
  category: varchar("category", { length: 20 }).notNull(),
  // product | pricing | competitor | faq | case
  title: varchar("title", { length: 100 }).notNull(),
  content: text("content").notNull(), // Markdown
  tags: jsonb("tags"),
  sortOrder: integer("sort_order").default(0),
  isPublished: boolean("is_published").notNull().default(true),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

#### API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `POST` | `/api/v1/admin/sales-knowledge` | 创建文章 | 运营/管理员 |
| `GET` | `/api/v1/admin/sales-knowledge` | 文章列表 | 运营/业务员 |
| `PATCH` | `/api/v1/admin/sales-knowledge/:id` | 更新文章 | 运营/管理员 |
| `GET` | `/api/v1/agent/sales-knowledge` | 我的可查阅列表 | 业务员 |
| `GET` | `/api/v1/agent/sales-knowledge/search q=` | 搜索 | 业务员 |

#### 前端变更

| 页面 | 变更 |
|------|------|
| 代理端 → 新增"销售知识库"入口 | 分类展示+搜索，纯阅读 |
| 管理后台 → 运营 → 新增"销售知识库管理" | 创建/编辑/发布文章 |

---

### 11.8 团队协作与客户交接

#### 背景

业务员离职或请假时，名下客户需要交接。当前没有客户交接流程，客户数据容易丢失。有多个业务员时，组长需要管理组内线索分配和团队业绩汇总。

#### 功能规格

| 模块 | 说明 |
|------|------|
| 客户转移 | 将名下客户/线索/商机/合同批量转移给其他业务员 |
| 交接记录 | 完整的交接日志：谁移了/谁接收/时间/包含哪些客户 |
| 团队视图 | 组长可查看组内所有业务员的客户/业绩/线索 |
| 线索分配 | 组长可将线索分配给组员 |
| 团队业绩汇总 | 按团队聚合的业绩总览 |

#### 数据表设计

```typescript
// sales_teams — 销售团队
export const salesTeams = pgTable("sales_teams", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  leaderId: integer("leader_id").notNull().references(() => users.id),
  description: varchar("description", { length: 200 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// sales_team_members — 团队成员
export const salesTeamMembers = pgTable("sales_team_members", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => salesTeams.id),
  userId: integer("user_id").notNull().references(() => users.id),
  role: varchar("role", { length: 20 }).notNull().default("member"), // leader | member
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

// customer_transfer_log — 客户交接日志
export const customerTransferLog = pgTable("customer_transfer_log", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull().references(() => users.id),
  toUserId: integer("to_user_id").notNull().references(() => users.id),
  customerIds: jsonb("customer_ids").notNull(), // [userId1, userId2, ...]
  transferType: varchar("transfer_type", { length: 20 }).notNull(),
  // customer | lead | opportunity | contract
  reason: varchar("reason", { length: 200 }),
  operatedBy: integer("operated_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

#### API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `POST` | `/api/v1/admin/teams` | 创建销售团队 | 管理员 |
| `GET` | `/api/v1/admin/teams` | 团队列表 | 管理员 |
| `POST` | `/api/v1/admin/teams/:id/members` | 添加成员 | 管理员/组长 |
| `DELETE` | `/api/v1/admin/teams/:id/members/:userId` | 移除成员 | 管理员/组长 |
| `POST` | `/api/v1/admin/customers/transfer` | 批量转移客户 | 管理员 |
| `POST` | `/api/v1/admin/leads/assign` | 批量分配线索 | 管理员/组长 |
| `GET` | `/api/v1/agent/team/performance` | 团队业绩汇总 | 组长 |
| `GET` | `/api/v1/agent/team/members` | 团队成员列表及业绩 | 组长 |

#### 前端变更

| 页面 | 变更 |
|------|------|
| 管理后台 → 新增"销售团队"入口 | 团队创建/成员管理 |
| 管理后台 → 客户管理 → 批量操作 | 新增"转移客户" |
| 管理后台 → 线索管理 → 批量操作 | 新增"分配线索" |
| 代理端 → 组长可见团队视图 | 组员业绩汇总+客户列表 |

---

### 11.9 业务员支撑模块总览

| 模块 | 优先级 | 预估工作量 | 核心价值 |
|------|--------|-----------|---------|
| CRM 客户管理 | P0 | 后端 4d + 前端 5d | 业务员日常工作最核心工具 |
| 线索管理 | P0 | 后端 3d + 前端 3d | 拓客入口，系统化管理潜在客户 |
| 客户跟进提醒 | P1 | 后端 2d + 前端 2d | 防止客户流失，提升跟进效率 |
| 商机与报价管理 | P1 | 后端 5d + 前端 5d | 企业客户成交的关键工具 |
| 业绩看板 | P1 | 后端 3d + 前端 3d | 激励业务员，数据驱动管理 |
| 合同管理 | P1 | 后端 5d + 前端 4d | 企业客户签约正规化 |
| 销售知识库 | P2 | 后端 2d + 前端 2d | 降低培训成本，统一对外话术 |
| 团队协作与客户交接 | P2 | 后端 3d + 前端 3d | 防止客户流失，支持团队管理 |

**合计**：后端 27 人天 + 前端 27 人天 = 约 7 周
> **备注**：§10 客服支撑模块与 §11 业务员支撑模块共用同一套前端框架（代理端+管理后台），但面向不同角色（客服 vs 销售），菜单入口和权限隔离。