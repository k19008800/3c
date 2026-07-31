# 深化参考：§24 代理商增强

> **对应**：[`SPEC-§24-代理商增强.md`](SPEC-§24-代理商增强.md)
> **关联**：[`ref-3-agent-system.md`](ref-3-agent-system.md)、[`SPEC-§8-运营增长模块.md`](SPEC-§8-运营增长模块.md)
> **优先级**：P1 | **状态**：需求文档（待开发）
> **最后更新**：2026-07-31

---

## 概述

在现有代理商体系（§3）基础上补全 6 项增强能力：邀请裂变、素材库、业绩排行榜、客户预警、多级佣金、自定义定价。其中邀请裂变已在先前开发中完成，其余为新需求。

---

## §24.1 邀请裂变（已存在）

### 数据表结构

```typescript
// agent_invites — 代理邀请记录
export const agentInvites = pgTable("agent_invites", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agents.id),
  inviteCode: varchar("invite_code", { length: 20 }).notNull().unique(),  // 如 AG-XXX-YYYY
  inviteType: varchar("invite_type", { length: 20 }).default("user"),
    // 'user' | 'agent'
  maxUses: integer("max_uses").default(0),  // 0 = 无限
  usedCount: integer("used_count").default(0),
  rewardRate: numeric("reward_rate", { precision: 5, scale: 2 }).default("0"),
    // 被邀请人消费返佣比例(%)
  rewardPeriodDays: integer("reward_period_days").default(30),
    // 返佣有效期天数
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// agent_invite_rewards — 邀请返佣记录
export const agentInviteRewards = pgTable("agent_invite_rewards", {
  id: serial("id").primaryKey(),
  inviteId: integer("invite_id").notNull().references(() => agentInvites.id),
  invitedUserId: integer("invited_user_id").notNull().references(() => users.id),
  consumptionAmount: numeric("consumption_amount", { precision: 20, scale: 4 }).notNull(),
  rewardAmount: numeric("reward_amount", { precision: 20, scale: 4 }).notNull(),
  period: varchar("period", { length: 10 }).notNull(),  // YYYY-MM
  status: varchar("status", { length: 20 }).default("pending"),
    // 'pending' | 'settled' | 'cancelled'
  settledAt: timestamp("settled_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
```

### API 接口

```
// 代理端
GET    /api/v1/agent/invites                   — 邀请记录列表
POST   /api/v1/agent/invites                   — 创建邀请链接（生成邀请码/二维码）
PUT    /api/v1/agent/invites/:id                — 修改邀请配置（返佣比例/有效期）
DELETE /api/v1/agent/invites/:id                — 关闭邀请链接
GET    /api/v1/agent/invites/:id/stats          — 邀请效果统计（点击/注册/消费）
GET    /api/v1/agent/invites/rewards            — 返佣收益列表
```

### 前端组件

```tsx
<AgentReferral
  inviteCode: string
  inviteLink: string
  qrCodeUrl: string
  stats: { clicks: number; registrations: number; consumption: number; rewards: number }
  invites: InviteRecord[]
  onCreate: (data: CreateInviteParams) => Promise<void>
  onUpdate: (id: number, data: Partial<InviteConfig>) => Promise<void>
/>

interface InviteRecord {
  id: number
  inviteCode: string
  type: 'user' | 'agent'
  maxUses: number
  usedCount: number
  rewardRate: number
  isActive: boolean
  createdAt: string
  expiresAt?: string
}
```

### 验收标准

| # | 用例 | 预期 |
|---|------|------|
| 24.1-1 | 代理生成邀请链接 | 生成唯一邀请码 + 带参数的注册链接 + 二维码 |
| 24.1-2 | 被邀请用户注册 | 注册时传入邀请码，建立上下游绑定关系 |
| 24.1-3 | 被邀请人消费触发返佣 | 按配置比例计算，记入待结算 |
| 24.1-4 | 邀请码过期 | 过期后注册不绑定上下游关系 |
| 24.1-5 | 代理查看邀请统计 | 总邀请数/注册转化率/带来消费额/累计返佣 |

---

## §24.2 素材库

### 数据表结构

```typescript
// agent_materials — 代理推广素材库
export const agentMaterials = pgTable("agent_materials", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agents.id),
  title: varchar("title", { length: 200 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(),
    // 'banner' | 'poster' | 'copy' | 'video' | 'article'
  content: text("content"),  // 文案内容（文字素材）
  fileUrl: varchar("file_url", { length: 500 }),  // 图片/视频文件 URL
  tags: text("tags"),  // 逗号分隔
  usageCount: integer("usage_count").default(0),
  isTemplate: boolean("is_template").default(false), // 是否为系统模板
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// agent_material_categories — 素材分类
export const agentMaterialCategories = pgTable("agent_material_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  parentId: integer("parent_id").references(() => agentMaterialCategories.id),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// agent_material_usage_logs — 素材使用记录
export const agentMaterialUsageLogs = pgTable("agent_material_usage_logs", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull().references(() => agentMaterials.id),
  agentId: integer("agent_id").notNull().references(() => agents.id),
  sharedTo: varchar("shared_to", { length: 100 }),  // 分享渠道
  createdAt: timestamp("created_at").defaultNow(),
});
```

### API 接口

```
// 公共素材市场（管理端上传系统模板）
GET    /api/v1/agent/materials                    — 素材库列表（支持分类/标签/搜索）
POST   /api/v1/agent/materials                    — 上传素材
PUT    /api/v1/agent/materials/:id                — 更新素材信息
DELETE /api/v1/agent/materials/:id                — 删除素材
POST   /api/v1/agent/materials/:id/usage          — 记录使用

// 管理端（系统模板管理）
GET    /api/v1/admin/materials                    — 系统素材模板列表
POST   /api/v1/admin/materials                    — 上传系统模板
PUT    /api/v1/admin/materials/:id                — 编辑系统模板
DELETE /api/v1/admin/materials/:id                — 删除系统模板
```

### 前端组件

```tsx
<AgentMaterialLibrary
  materials: AgentMaterial[]
  categories: Category[]
  filters: { categoryId?: number; type?: string; search?: string }
  onFilterChange: (filters) => void
  onUpload: (file: File) => Promise<string>
  onDelete: (id: number) => Promise<void>
  onUse: (id: number) => Promise<void>
/>

interface AgentMaterial {
  id: number
  title: string
  type: 'banner' | 'poster' | 'copy' | 'video' | 'article'
  content?: string
  fileUrl?: string
  tags: string[]
  usageCount: number
  isTemplate: boolean
  createdAt: string
  previewUrl?: string
}
```

### 验收标准

| # | 用例 | 预期 |
|---|------|------|
| 24.2-1 | 代理浏览素材库 | 按分类/标签筛选，支持关键词搜索 |
| 24.2-2 | 代理上传素材 | 支持图片（jpg/png ≤5M）、视频（mp4 ≤20M）、纯文字 |
| 24.2-3 | 代理使用素材 | 点击"使用"复制链接/下载，记录使用次数 |
| 24.2-4 | 管理端上传系统模板 | 模板对所有代理可见，置顶显示 |
| 24.2-5 | 素材使用统计 | 各素材使用次数、热门素材排行 |

---

## §24.3 业绩排行榜

### 数据表结构

```typescript
// agent_rankings — 代理排行数据（日/周/月汇总）
export const agentRankings = pgTable("agent_rankings", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agents.id),
  periodType: varchar("period_type", { length: 10 }).notNull(),
    // 'daily' | 'weekly' | 'monthly'
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  rank: integer("rank"),
  totalConsumption: numeric("total_consumption", { precision: 20, scale: 4 }).default("0"),
  totalClients: integer("total_clients").default(0),
  newClients: integer("new_clients").default(0),
  commissionEarned: numeric("commission_earned", { precision: 20, scale: 4 }).default("0"),
  satisfaction: numeric("satisfaction", { precision: 3, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### API 接口

```
GET    /api/v1/agent/rankings                     — 我的排名
  params: { periodType: 'daily'|'weekly'|'monthly', date?: string }
GET    /api/v1/agent/rankings/top                 — TOP 20 排行榜
  params: { periodType, date?, tier?: number }    // tier: 代理等级筛选
GET    /api/v1/admin/rankings                     — 管理端全量排行
  params: { periodType, date?, page, limit, sort? }
GET    /api/v1/agent/rankings/my-statistics       — 我的历史统计趋势
  params: { periodType, months: 6 }
```

### 前端组件

```tsx
<AgentRankingBoard
  myRank: AgentRank
  topList: AgentRank[]
  periodType: 'daily' | 'weekly' | 'monthly'
  onPeriodChange: (type) => void
  tiers: { value: number; label: string }[]
/>

interface AgentRank {
  agentId: number
  agentName: string
  tier: string
  rank: number
  totalConsumption: number
  totalClients: number
  newClients: number
  commissionEarned: number
  satisfaction: number
  trend?: 'up' | 'down' | 'stable'
}
```

### 验收标准

| # | 用例 | 预期 |
|---|------|------|
| 24.3-1 | 代理查看我的排名 | 显示当前排名和各项指标 |
| 24.3-2 | TOP 20 榜单 | 按消费额排序，显示代理名/等级/指标 |
| 24.3-3 | 日/周/月切换 | 不同周期的排名数据正确 |
| 24.3-4 | 排名趋势 | 与上一周期的排名对比（上升/下降/持平） |
| 24.3-5 | 管理端查看全量排行 | 支持筛选、排序、导出 |

---

## §24.4 客户预警（已实现）

详见 `MEMORY.md` 记录：`agent_alerts` 表 + 后端 2 API + 前端 AgentAlerts.tsx。

### 数据表结构

```typescript
// agent_alerts — 代理客户预警
export const agentAlerts = pgTable("agent_alerts", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agents.id),
  clientId: integer("client_id").notNull().references(() => users.id),
  alertType: varchar("alert_type", { length: 30 }).notNull(),
    // 'balance_low' | 'inactive' | 'usage_drop' | 'churn_risk'
  severity: varchar("severity", { length: 10 }).default("normal"),
    // 'low' | 'normal' | 'high'
  message: text("message").notNull(),
  thresholdValue: numeric("threshold_value", { precision: 20, scale: 4 }),
  currentValue: numeric("current_value", { precision: 20, scale: 4 }),
  isRead: boolean("is_read").default(false),
  isResolved: boolean("is_resolved").default(false),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
```

### API 接口

```
GET    /api/v1/agent/alerts                       — 预警列表
  params: { alertType?, severity?, isRead?, isResolved?, page, limit }
POST   /api/v1/agent/alerts/:id/read              — 标记已读
POST   /api/v1/agent/alerts/:id/resolve           — 标记已处理
GET    /api/v1/agent/alerts/summary               — 预警汇总统计
```

### 预警规则

| 预警类型 | 触发条件 | 严重级别 | 处理建议 |
|---------|---------|---------|---------|
| balance_low | 客户余额 < ¥100 | high | 协助客户充值，防止调用受影响 |
| inactive | 客户连续 15 天无调用 | normal | 了解客户使用情况，主动跟进 |
| usage_drop | 客户月消费同比降 > 50% | high | 排查服务问题或客户流失风险 |
| churn_risk | 客户连续 2 月消费下降 + 余额 < ¥50 | high | 高级客服跟进，提供优惠方案 |

### 验收标准

| # | 用例 | 预期 |
|---|------|------|
| 24.4-1 | 触发余额预警 | 客户余额低于阈值时自动创建预警 |
| 24.4-2 | 代理查看预警列表 | 按类型/严重度筛选，显示客户信息和当前值 |
| 24.4-3 | 标记已处理 | 预警标记为已处理，不再出现在待处理列表 |
| 24.4-4 | 预警汇总 | 各类型预警数量、未处理、已处理统计 |

---

## §24.5 多级佣金（基础已存在）

现有 `agents.parentAgentId` / `teamDepth` 字段已有。基础数据模型支持三级代理结构（一级→二级→三级），佣金抽成比例需扩展配置。

### 数据表扩展

```typescript
// 在现有 agent_commission_configs 或代理表中扩展
// agent_level_commission — 多级佣金比例配置
export const agentLevelCommission = pgTable("agent_level_commission", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agents.id),
  level: integer("level").notNull(),  // 1: 直推代理佣金, 2: 二级佣金, 3: 三级佣金
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull(),
    // 百分比，如 5.00 表示 5%
  commissionType: varchar("commission_type", { length: 20 }).default("consumption"),
    // 'consumption' | 'subscription' | 'one_time'
  maxPerMonth: numeric("max_per_month", { precision: 20, scale: 4 }),
    // 月度封顶
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// agent_team_commission_records — 多级佣金结算记录
export const agentTeamCommissionRecords = pgTable("agent_team_commission_records", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agents.id),
  sourceAgentId: integer("source_agent_id").notNull().references(() => agents.id),
  level: integer("level").notNull(),
  consumptionAmount: numeric("consumption_amount", { precision: 20, scale: 4 }).notNull(),
  commissionAmount: numeric("commission_amount", { precision: 20, scale: 4 }).notNull(),
  period: varchar("period", { length: 10 }).notNull(),  // YYYY-MM
  status: varchar("status", { length: 20 }).default("pending"),
    // 'pending' | 'settled' | 'cancelled'
  settledAt: timestamp("settled_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
```

### 分配逻辑

```
用户 A（一级代理）
  └── 邀请代理 B（二级代理）
       ├── 用户 C → B 的消费 × B 的佣金率
       └── A 获得 C 消费 × level_2_rate（如 2%）
            └── 邀请代理 D（三级代理）
                 └── 用户 E → D 获得 E 消费 × D 佣金率
                      └── B 获得 E 消费 × level_2_rate（如 1%）
                           └── A 获得 E 消费 × level_3_rate（如 0.5%）
```

### API 接口

```
GET    /api/v1/agent/commission-levels            — 各级佣金配置
PUT    /api/v1/agent/commission-levels             — 更新多级抽成比例
GET    /api/v1/agent/team-commission               — 多级佣金收益列表
  params: { level?, period?, status?, page, limit }
GET    /api/v1/agent/team-structure                — 团队树形结构
```

### 验收标准

| # | 用例 | 预期 |
|---|------|------|
| 24.5-1 | 代理配置各级抽成比例 | 一级代理可设置对下级代理的分成比例 |
| 24.5-2 | 三级佣金计算 | 最终用户的消费按三级比例逐级分配 |
| 24.5-3 | 佣金封顶 | 月度佣金超过封顶值时不再累加 |
| 24.5-4 | 团队结构查看 | 树形展示名下代理层级关系 |

---

## §24.6 自定义定价（已实现）

详见 `MEMORY.md` 记录：`agent_client_pricing` 表 + 后端 3 API + 前端 AgentClientPricing.tsx。

### 数据表结构

```typescript
// agent_client_pricing — 代理商客户自定义定价
export const agentClientPricing = pgTable("agent_client_pricing", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agents.id),
  clientId: integer("client_id").notNull().references(() => users.id),
  modelId: integer("model_id").notNull().references(() => models.id),
  customPrice: numeric("custom_price", { precision: 20, scale: 6 }),
  customDiscount: numeric("custom_discount", { precision: 5, scale: 2 }),
    // 折扣率百分比，如 10.00 表示打 9 折
  priceOverride: varchar("price_override", { length: 20 }).default("discount"),
    // 'fixed' | 'discount' | 'inherit'
  isActive: boolean("is_active").default(true),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### API 接口

```
GET    /api/v1/agent/client-pricing               — 自定义定价列表
GET    /api/v1/agent/client-pricing/:id            — 定价详情
POST   /api/v1/agent/client-pricing               — 设置客户定价
  body: { clientId, modelId, priceType: 'fixed'|'discount', priceValue }
PUT    /api/v1/agent/client-pricing/:id            — 修改定价
DELETE /api/v1/agent/client-pricing/:id            — 删除定价（恢复为继承）
GET    /api/v1/agent/client-pricing/effective/:clientId — 查询某客户实际执行价
```

---

## 边界条件

| # | 场景 | 处理方式 |
|---|------|---------|
| AGT-001 | 邀请裂变：返佣超过代理可用佣金余额 | 拦截返佣发放，告警提示余额不足，不影响被邀请人已到账返佣 |
| AGT-002 | 素材库：上传文件大小/格式违规 | 前端+后端双重校验；图片超 5MB 或非 jpg/png/gif 则拒绝 |
| AGT-003 | 业绩排行：周期切换时数据过渡 | T+1 生成周期汇总数据，切换期显示"昨日/上周/上月"数据 |
| AGT-004 | 客户预警：同一客户连续触发同类预警 | 同一客户+同类预警 24h 内不重复创建（去重窗口） |
| AGT-005 | 多级佣金：代理降级后下级关系 | 降级后不再获得下级佣金；历史已结算的不追溯 |
| AGT-006 | 自定义定价：客户同时有代理定价+平台折扣 | 取两者较低价；代理定价优先级高于平台优惠 |
| AGT-007 | 素材库：代理删除系统模板 | 系统模板不可删除，仅可隐藏（is_active=false） |
| AGT-008 | 邀请裂变：邀请码碰撞 | 邀请码使用雪花ID+随机字符，生成时唯一性校验 |
| AGT-009 | 多级佣金：代理脱离上级 | 解除绑定关系后，下级消费不再产生上级佣金 |
| AGT-010 | 自定义定价：模型价格变更 | 固定价格不受影响；折扣价格重新基于新基准价计算 |

---

## 上下游关系

```
§24 代理商增强:
  ├── §24.1 邀请裂变: agentInvites → agentInviteRewards → 关联 §3 代理佣金体系
  ├── §24.2 素材库: agentMaterials/categories → 文件上传服务
  ├── §24.3 业绩排行: agentRankings → 报表服务（定时汇总）
  ├── §24.4 客户预警: agentAlerts → 通知服务（站内+邮件）
  ├── §24.5 多级佣金: agentLevelCommission → 代理树(agents.parentAgentId) → 结算对账
  ├── §24.6 自定义定价: agentClientPricing → 计费引擎 §5.2
  └── 管理端: admin API 全量管理 → ref-4.3-vendor-model / ref-4.4-finance
```
