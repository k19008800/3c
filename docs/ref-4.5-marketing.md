# 营销与运营 — 深化参考文档

> **对应章节**：[PRD-README.md §4.5 营销与运营精化](../PRD-README.md#45-营销与运营精化)
> **状态**：基于现有后端代码（`api/src/db/schema/campaigns.ts`、`api/src/db/schema/redemption.ts`、`api/src/db/schema/code-templates.ts`、`api/src/routes/admin/campaigns/`、`api/src/routes/admin/announcements.ts`、`api/src/routes/admin/email-templates.ts`、`api/src/services/activity-push-service.ts` 等）生成
> **粒度**：Schema 字段定义 → API 接口 → 前端组件 Props → 数据流 → 交叉引用

---

## 目录

1. [营销活动管理](#1-营销活动管理)
2. [兑换码系统](#2-兑换码系统)
3. [公告系统](#3-公告系统)
4. [邮件模板](#4-邮件模板)
5. [实时活动流](#5-实时活动流)
6. [商品与定价](#6-商品与定价)
7. [跨模块数据流](#7-跨模块数据流)

---

## 1. 营销活动管理

### 1.1 数据表结构

#### `campaigns` — 营销活动

```typescript
export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  status: campaignStatusEnum("status").notNull().default("draft"),
  startAt: timestamp("start_at", { withTimezone: true }),
  endAt: timestamp("end_at", { withTimezone: true }),
  autoEnd: integer("auto_end").notNull().default(1),          // 1=自动结束, 0=手动结束
  budgetAmount: bigint("budget_amount", { mode: "number" }).notNull().default(0),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 索引
campaigns_status_idx       — on(status)
campaigns_created_by_idx   — on(createdBy)
campaigns_start_end_idx    — on(startAt, endAt)
```

#### `campaign_codes` — 活动码分配

```typescript
export const campaignCodes = pgTable("campaign_codes", {
  campaignId: integer("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  agentId: integer("agent_id").references(() => agents.id),
  allocatedCount: integer("allocated_count").notNull().default(0),
  usedCount: integer("used_count").notNull().default(0),
}, (table) => ({
  pk: primaryKey({ columns: [table.campaignId, table.agentId] }),
}));
```

#### `campaignStatusEnum`

```typescript
export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",    // 草稿
  "active",   // 进行中
  "ended",    // 已结束
  "archived", // 已归档
]);
```

### 1.2 活动状态机

```
draft ──→ active ──→ ended ──→ archived
  ↑          ↓
  └── 编辑退回 ─┘
```

允许的状态转换：
- `draft → active`：提交发布
- `active → ended`：手动结束
- `active → ended`（自动）：到达 `endAt` 或 `autoEnd = 1` 时 cron 自动结束
- `ended → draft`：再次编辑（退回草稿）
- `ended → archived`：归档（不可逆）

### 1.3 API 接口

#### CRUD

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/campaigns` | 活动列表（分页） | USER_EDIT |
| GET | `/api/v1/admin/campaigns/:id` | 活动详情 + 代理分配进度 | USER_EDIT |
| POST | `/api/v1/admin/campaigns` | 创建活动 | USER_EDIT |
| PATCH | `/api/v1/admin/campaigns/:id` | 更新草稿活动 | USER_EDIT |
| PATCH | `/api/v1/admin/campaigns/:id/status` | 变更状态 | USER_EDIT |

#### 活动兑换码管理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/admin/campaigns/:id/allocations` | 给代理商分配兑换码配额 |
| GET | `/api/v1/admin/campaigns/:id/codes` | 查看活动兑换码列表 |
| GET | `/api/v1/admin/campaigns/:id/allocations` | 查看代理分配进度 |
| POST | `/api/v1/admin/campaigns/:id/generate-codes` | 生成活动兑换码 |
| POST | `/api/v1/admin/campaigns/:id/commission-rule` | 配置佣金规则 |
| GET | `/api/v1/admin/campaigns/:id/stats` | 活动统计 |

#### 创建活动请求体

```json
{
  "name": "七月充值满赠",
  "description": "单笔充值满 ¥500 赠 ¥50",
  "startAt": "2026-07-01T00:00:00.000Z",
  "endAt": "2026-07-31T23:59:59.000Z",
  "autoEnd": 1,
  "budgetAmount": 1000000
}
```

#### 变更状态

```json
// PATCH /api/v1/admin/campaigns/:id/status
{ "status": "active" }
```

#### 活动详情响应

```json
{
  "code": 0,
  "data": {
    "id": 1,
    "name": "七月充值满赠",
    "status": "active",
    "startAt": "2026-07-01T00:00:00.000Z",
    "endAt": "2026-07-31T23:59:59.000Z",
    "budgetAmount": 1000000,
    "allocations": [
      { "agentId": 5, "agentName": "一级代理-张三", "allocatedCount": 1000, "usedCount": 345 },
      { "agentId": null, "agentName": "平台自营", "allocatedCount": 5000, "usedCount": 2340 }
    ]
  }
}
```

#### 活动统计响应

```json
{
  "totalAllocated": 6000,
  "totalUsed": 2685,
  "usageRate": "44.8%",
  "byAgent": [
    { "agentId": 5, "agentName": "一级代理-张三", "allocated": 1000, "used": 345, "rate": "34.5%" }
  ]
}
```

### 1.4 前端活动管理页面

```
admin → 运营 → 营销活动
├── 活动列表（表格）
│   ├── 活动名称
│   ├── 状态（草稿/进行中/已结束/已归档 + 色标）
│   ├── 时间范围
│   ├── 预算
│   ├── 码分配率（已用/已分配）
│   └── 操作（编辑/发布/结束/归档）
│
├── 创建/编辑活动弹窗
│   ├── 活动名称
│   ├── 描述（多行文本）
│   ├── 时间范围选择器
│   ├── 预算金额（整数，单位：分）
│   ├── 自动结束开关
│   └── 保存 / 保存并发布
│
└── 活动详情页
    ├── 概览卡片（状态/时间/预算/创建人）
    ├── 分配进度面板
    │   ├── 代理分配列表（代理名/已分配/已使用/使用率）
    │   └── 分配操作（给代理分配额度）
    ├── 兑换码列表
    └── 统计面板（分配率/使用率趋势）
```

**CampaignListProps**：
```typescript
interface CampaignListProps {
  statusFilter?: 'all' | 'draft' | 'active' | 'ended' | 'archived';
  onStatusChange: (id: number, status: string) => Promise<void>;
}
```

**CampaignDetailProps**：
```typescript
interface CampaignDetailProps {
  campaignId: number;
  onAllocate: (agentId: number, count: number) => Promise<void>;
  onGenerateCodes: (count: number) => Promise<void>;
}
```

---

## 2. 兑换码系统

### 2.1 数据表结构

#### `redemption_batches` — 兑换码批次

```typescript
export const redemptionBatches = pgTable("redemption_batches", {
  id: serial("id").primaryKey(),
  creatorId: integer("creator_id").notNull().references(() => users.id),
  name: varchar("name", { length: 200 }).notNull(),
  amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
  totalCount: integer("total_count").notNull(),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  maxUses: integer("max_uses"),                            // null=不限, 非null=每人限用
  status: redemptionBatchStatusEnum("status").notNull().default("active"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 索引
redemption_batches_creator_id_idx     — on(creatorId)
redemption_batches_status_idx          — on(status)
redemption_batches_expires_at_idx       — on(expiresAt)
```

#### `redemption_codes` — 兑换码

```typescript
export const redemptionCodes = pgTable("redemption_codes", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => redemptionBatches.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 16 }).notNull().unique(),
  amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
  usesLeft: integer("uses_left").notNull().default(1),
  status: redemptionCodeStatusEnum("status").notNull().default("unused"),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 索引
redemption_codes_code_idx       — unique(code)
redemption_codes_batch_id_idx    — on(batchId)
redemption_codes_status_idx      — on(status)
```

#### `redemption_logs` — 兑换日志

```typescript
export const redemptionLogs = pgTable("redemption_logs", {
  id: serial("id").primaryKey(),
  codeId: integer("code_id").notNull().references(() => redemptionCodes.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id),
  amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
  batchId: integer("batch_id").references(() => redemptionBatches.id),
  ip: varchar("ip", { length: 45 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 索引
redemption_logs_code_id_idx             — on(codeId)
redemption_logs_user_id_idx             — on(userId)
redemption_logs_user_created_at_idx      — on(userId, createdAt DESC)
```

#### `redemption_fraud_events` — 风控事件

```typescript
export const redemptionFraudEvents = pgTable("redemption_fraud_events", {
  id: serial("id").primaryKey(),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  ip: varchar("ip", { length: 45 }),
  userId: integer("user_id"),
  codeId: integer("code_id"),
  code: varchar("code", { length: 16 }),
  riskScore: integer("risk_score").notNull().default(0),
  detail: text("detail"),
  severity: varchar("severity", { length: 20 }).notNull().default("warning"),
  acknowledged: boolean("acknowledged").notNull().default(false),
  acknowledgedBy: integer("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 索引
redeem_fraud_events_type_idx      — on(eventType)
redeem_fraud_events_ip_idx        — on(ip)
redeem_fraud_events_severity_idx   — on(severity)
redeem_fraud_events_ack_idx        — on(acknowledged)
redeem_fraud_events_created_at_idx — on(createdAt)
```

#### `redemption_gift_logs` — 转赠日志

```typescript
export const redemptionGiftLogs = pgTable("redemption_gift_logs", {
  id: serial("id").primaryKey(),
  originalCodeId: integer("original_code_id").notNull(),
  newCodeId: integer("new_code_id").notNull(),
  batchId: integer("batch_id").notNull(),
  fromUserId: integer("from_user_id").notNull().references(() => users.id),
  toUserId: integer("to_user_id").notNull().references(() => users.id),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 索引
gift_logs_from_user_id_idx    — on(fromUserId)
gift_logs_to_user_id_idx      — on(toUserId)
gift_logs_batch_id_idx        — on(batchId)
gift_logs_created_at_idx      — on(createdAt)
```

#### `code_templates` — 兑换码模板（辅助表）

```typescript
export const codeTemplates = pgTable("code_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  type: varchar("type", { length: 20 }).notNull().default("fixed_token"),
  tokenAmount: numeric("token_amount", { precision: 18, scale: 6 }).notNull(),
  validDays: integer("valid_days"),                        // null=永久
  maxPerUser: integer("max_per_user").notNull().default(1),
  userScope: varchar("user_scope", { length: 20 }).notNull().default("all"),
  remark: text("remark"),
  createdByType: varchar("created_by_type", { length: 10 }).notNull(),
  createdById: integer("created_by_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 索引
code_templates_creator_idx — on(createdByType, createdById)
```

### 2.2 枚举

```typescript
export const redemptionBatchStatusEnum = pgEnum("redemption_batch_status", [
  "active",    // 有效
  "expired",   // 过期
  "disabled",  // 禁用
]);

export const redemptionCodeStatusEnum = pgEnum("redemption_code_status", [
  "unused",    // 未使用
  "used",      // 已使用
  "expired",   // 已过期
  "revoked",   // 已撤销
]);
```

### 2.3 API 接口

#### 兑换码批次管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/redemption/batches` | 批次列表 | CONFIG_VIEW |
| POST | `/api/v1/admin/redemption/batches` | 创建批次 | CONFIG_EDIT |
| GET | `/api/v1/admin/redemption/batches/:id` | 批次详情 | CONFIG_VIEW |
| PATCH | `/api/v1/admin/redemption/batches/:id` | 更新批次 | CONFIG_EDIT |
| POST | `/api/v1/admin/redemption/batches/:id/generate` | 生成码 | CONFIG_EDIT |
| GET | `/api/v1/admin/redemption/batches/:id/codes` | 码列表 | CONFIG_VIEW |
| GET | `/api/v1/admin/redemption/batches/:id/logs` | 使用日志 | CONFIG_VIEW |

**创建批次**：
```json
{
  "name": "七月推广码",
  "amount": 100.00,
  "totalCount": 500,
  "expiresAt": "2026-07-31T23:59:59.000Z",
  "maxUses": 1
}
```

**生成码（PATCH）**：批次创建后系统自动生成 `totalCount` 个随机码
- 码格式：8-16 位字母数字混合（大写）
- 使用 `crypto.randomBytes` 生成，去重保障
- 码的唯一性由 `redemption_codes.code_idx` 唯一索引保证

#### 用户端兑换

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/redemption/redeem` | 用户兑换码 |
| GET | `/api/v1/redemption/history` | 用户兑换历史 |
| POST | `/api/v1/redemption/gift` | 转赠兑换码 |

**兑换请求**：
```json
{ "code": "3C-ABCDEF1234" }
```

**兑换流程**：
```
1. 查码（code 唯一索引）
2. 验证码状态（status = unused）
3. 验证过期时间（expiresAt > now）
4. 验证 maxPerUser：
   → 查 redemption_logs 该用户使用该批次次数
   → 若 batch.maxUses 不为 null 且已用次数 >= maxUses → 拒绝
5. 验证 usesLeft（> 0）
6. 事务内：
   a. UPDATE redemptionCodes SET status='used', usesLeft=usesLeft-1, usedAt=NOW()
   b. INSERT redemptionLogs
   c. 用户余额增加 amount
   d. UPDATE redemptionBatches SET usedCount=usedCount+1
7. 记录审计日志
```

#### 兑换风控

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/admin/redemption/fraud-events` | 风控事件列表 |
| POST | `/api/v1/admin/redemption/fraud-events/:id/acknowledge` | 处置事件 |

**风控规则**：
- 同一 IP 短时间内大量兑换 → 记录 `redemption_fraud_events`
- 同一兑换码多次尝试 → 记录
- 异常兑换时间（深夜）→ 记录

### 2.4 前端兑换码管理页面

```
admin → 运营 → 兑换码
├── 兑换码批次列表
│   ├── 批次名
│   ├── 金额
│   ├── 总数/已用数
│   ├── 有效期
│   ├── 状态（active/expired/disabled + 色标）
│   └── 操作（编辑/禁用/导出）
│
├── 创建批次弹窗
│   ├── 批次名称
│   ├── 单个码面额
│   ├── 生成数量
│   ├── 有效期
│   └── 每人限用次数
│
├── 批次详情页
│   ├── 概览卡片
│   ├── 码列表（分页表格：码/状态/使用者/使用时间）
│   └── 使用日志（用户/金额/IP/时间）
│
└── 风控面板
    ├── 风控事件列表（类型/IP/风险分数/严重等级/已处置/时间）
    ├── 事件处置按钮
    └── 规则配置（阈值/时间窗口）
```

**RedemptionBatchListProps**：
```typescript
interface RedemptionBatchListProps {
  filters?: { status?: string; dateRange?: [string, string] };
}
```

**RedemptionBatchCreateProps**：
```typescript
interface RedemptionBatchCreateProps {
  templates?: CodeTemplate[];        // 可选：从模板快速创建
  onCreated: (batch: RedemptionBatch) => void;
}
```

---

## 3. 公告系统

### 3.1 数据表结构

> **注意**：`announcements` 表通过原始 SQL 迁移创建，非 Drizzle ORM schema 文件。`announcement_reads` 表通过 `0020_add_announcement_reads.sql` 迁移创建。

```sql
CREATE TABLE announcements (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(500) NOT NULL,
  content     TEXT NOT NULL,
  type        VARCHAR(50) NOT NULL DEFAULT 'system_announcement',
  status      BOOLEAN NOT NULL DEFAULT true,         -- true=已发布, false=草稿
  is_published BOOLEAN NOT NULL DEFAULT false,        -- true=已推送, false=未推送（定时）
  priority    INTEGER NOT NULL DEFAULT 0,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX announcements_status_idx ON announcements(status);
CREATE INDEX announcements_created_at_idx ON announcements(created_at DESC);

-- 公告已读记录（0020 migration）
CREATE TABLE announcement_reads (
  id            SERIAL PRIMARY KEY,
  announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(announcement_id, user_id)
);
```

### 3.2 API 接口

#### 管理端

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/announcements` | 公告列表（分页）| USER_EDIT |
| POST | `/api/v1/admin/announcements` | 创建公告 | USER_EDIT |
| PATCH | `/api/v1/admin/announcements/:id` | 更新公告 | USER_EDIT |
| DELETE | `/api/v1/admin/announcements/:id` | 删除公告 | USER_EDIT |
| GET | `/api/v1/admin/announcements/:id/stats` | 阅读统计 | USER_EDIT |
| GET | `/api/v1/admin/announcements/:id/readers` | 已读用户列表 | USER_EDIT |

**创建公告**：
```json
{
  "title": "7月系统维护通知",
  "content": "<p>系统将于 7月30日 23:00-02:00 进行维护...</p>",
  "type": "system_announcement",
  "priority": 1
}
```

#### 用户端

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/announcements` | 已发布公告列表（含已读状态） |
| POST | `/api/v1/announcements/:id/read` | 标记已读 |
| POST | `/api/v1/announcements/read-all` | 全部标记已读 |
| GET | `/api/v1/announcements/unread-count` | 未读公告数量 |

#### 公告推送机制

```
发布公告（管理端）
  → broadcastAnnouncement()
    → SELECT id FROM users WHERE status = 'active'
    → 分片 500 条/批 INSERT user_notifications
    → 返回推送人数
```

**定时发布**：`cron/publish-scheduled-announcements.ts` 每分钟检查，将到达时间且 `is_published=false` 的公告自动发布并广播推送。

### 3.3 前端公告管理页面

```
admin → 运营 → 公告管理
├── 公告列表（表格）
│   ├── 标题
│   ├── 类型
│   ├── 优先级（置顶标识）
│   ├── 状态（已发布/草稿）
│   ├── 推送人数/已读率
│   └── 操作（编辑/删除/统计）
│
├── 编辑公告弹窗
│   ├── 标题
│   ├── 类型（下拉：系统公告/维护通知/活动通知/安全告警）
│   ├── 内容（富文本编辑器）
│   ├── 优先级
│   ├── 定时发布
│   └── 预览/保存草稿/提交发布
│
└── 阅读统计面板
    ├── 推送总人数
    ├── 已读/未读人数 + 百分比饼图
    └── 未读用户列表（分页，支持搜索和再次推送）
```

**AnnouncementEditorProps**：
```typescript
interface AnnouncementEditorProps {
  initial?: { title: string; content: string; type: string; priority: number };
  onSubmit: (data: AnnouncementFormData) => Promise<void>;
}

interface AnnouncementFormData {
  title: string;
  content: string;        // HTML 富文本
  type: string;
  priority: number;
  scheduledAt?: string;   // 定时发布时间
}
```

**AnnouncementStatsProps**：
```typescript
interface AnnouncementStatsProps {
  announcementId: number;
  stats: { totalPushed: number; readCount: number; readRate: number };
  unreadUsers: { id: number; nickname: string; email: string }[];
  onRepush: (userIds: number[]) => Promise<void>;
}
```

---

## 4. 邮件模板

### 4.1 数据表结构

> **注意**：`email_templates` 表通过原始 SQL 迁移创建。字段由路由代码推断：

```typescript
// 由 routes/admin/email-templates.ts 推断的表结构
interface EmailTemplate {
  id: number;
  name: string;               // 模板名称（唯一标识）
  subjectZh: string;           // 中文标题（带变量占位）
  subjectEn: string;           // 英文标题
  bodyHtmlZh: string;          // 中文正文 HTML（带变量占位）
  bodyHtmlEn: string;          // 英文正文 HTML
  updatedAt: Date;
}
```

### 4.2 模板变量系统

```
{{username}}   — 用户昵称
{{amount}}     — 金额
{{time}}       — 时间
{{balance}}    — 当前余额
{{keyName}}    — API Key 名称
{{modelName}}  — 模型名称
{{reason}}     — 原因
{{code}}       — 验证码
```

### 4.3 API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/email-templates` | 模板列表 | CONFIG_VIEW |
| POST | `/api/v1/admin/email-templates` | 创建模板 | CONFIG_EDIT |
| PUT | `/api/v1/admin/email-templates/:name` | 更新模板 | CONFIG_EDIT |
| DELETE | `/api/v1/admin/email-templates/:name` | 删除模板 | CONFIG_EDIT |
| POST | `/api/v1/admin/email-templates/:name/test` | 发送测试邮件 | CONFIG_EDIT |

**创建模板**：
```json
{
  "name": "recharge_success",
  "subjectZh": "充值成功 - {{amount}} 已到账",
  "subjectEn": "Recharge Successful - {{amount}} Credited",
  "bodyHtmlZh": "<p>尊敬的 {{username}}，您好！</p><p>您在 {{time}} 充值 ¥{{amount}} 已成功到账。</p><p>当前余额：¥{{balance}}</p>",
  "bodyHtmlEn": "<p>Dear {{username}},</p><p>Your recharge of ¥{{amount}} at {{time}} has been completed.</p><p>Current Balance: ¥{{balance}}</p>"
}
```

**测试发送**：
```json
// POST /api/v1/admin/email-templates/:name/test
{ "to": "admin@3cloud.ai" }
// 变量自动替换为示例值发送
```

### 4.4 前端邮件模板页面

```
admin → 运营 → 邮件模板
├── 模板列表（卡片/表格）
│   ├── 模板名称
│   ├── 中文标题预览
│   ├── 使用场景
│   └── 操作（编辑/删除/测试）
│
├── 编辑模板弹窗
│   ├── 模板名称（唯一，不可修改）
│   ├── 中文标题（支持变量占位）
│   ├── 英文标题
│   ├── 中文正文（富文本编辑器，变量占位按钮）
│   ├── 英文正文
│   ├── 变量对照表（显示可用变量及示例值）
│   └── 预览（变量替换为示例值后的效果）
│
└── 测试邮件发送弹窗
    ├── 接收邮箱输入
    └── 发送结果反馈
```

**EmailTemplateEditorProps**：
```typescript
interface EmailTemplateEditorProps {
  name?: string;                              // null=新建, 非null=编辑
  onSaved: (name: string) => Promise<void>;
}

interface EmailTemplateTestProps {
  templateId: number;
  onTestSent: () => void;
}
```

---

## 5. 实时活动流

### 5.1 架构

```
API 调用完成
  → ActivityPushService.publish(event)
    → 写入 Redis PUBLISH 3cloud:activity:push
    → 所有连接的管理端 WebSocket 实例收到推送
    → 前端实时更新活动流面板
```

### 5.2 事件模型

```typescript
interface ActivityEvent {
  id: string;              // 事件 ID（UUID）
  timestamp: Date;
  model: string;           // 调用的模型
  status: 'success' | 'error';
  inputTokens: number;
  outputTokens: number;
  cost: number;
  keyName?: string;
}
```

### 5.3 前端实时活动流

```
admin → 仪表盘（或独立面板）→ 实时活动流
├── 实时活动卡片列表（最新 50 条）
│   ├── 模型名称
│   ├── 状态（成功/失败 + 色标）
│   ├── Token 数量
│   ├── 消费金额
│   ├── Key 名称
│   └── 时间（相对时间，如"3秒前"）
│
├── 自动滚动（开/关）
└── 筛选（仅成功/仅失败/指定模型）
```

**ActivityStreamProps**：
```typescript
interface ActivityStreamProps {
  maxItems?: number;           // 默认 50
  filter?: { status?: string; model?: string };
  autoScroll?: boolean;
}
```

---

## 6. 通知订阅与偏好

> 用户端可配置推送偏好，控制哪些类型的通知推送到站内信/邮箱。

### 6.1 告警类型

```typescript
export const alertTypeEnum = pgEnum("alert_type", [
  "failure_rate_spike",      // 失败率飙升
  "quota_exhaustion",        // 额度耗尽
  "suspicious_login",        // 可疑登录
  "abnormal_call_pattern",   // 异常调用模式
  "security_event",          // 安全事件
  "system_maintenance",      // 系统维护
  "feature_update",          // 功能更新
  "billing_reminder",        // 账单提醒
]);
```

### 6.2 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/notification-subscriptions` | 获取订阅配置 |
| PUT | `/api/v1/notification-subscriptions` | 更新订阅配置 |

### 6.3 前端用户通知偏好

```
用户中心 → 通知设置
├── 通知类型列表
│   ├── 失败率飙升（邮箱推送 ☐ / 站内信 ☑）
│   ├── 额度耗尽（邮箱 ☑ / 站内信 ☑）
│   ├── 安全事件（邮箱 ☑ / 站内信 ☑）
│   └── 账单提醒（邮箱 ☑ / 站内信 ☐）
│
└── 保存
```

---

## 7. 跨模块数据流

### 7.1 营销活动与兑换码联动链路

```
创建活动（campaign）
  → POST /api/v1/admin/campaigns（draft）
  → 配置代理分配额度（campaign_codes）
  → 生成兑换码（调用 redemption_batches + redemption_codes）
  → PATCH status=active → 活动生效
  
用户兑换
  → POST /api/v1/redemption/redeem（验证码）
  → 加余额
  → 记录 redemption_logs
  → campaign_codes.usedCount +1
  
活动结束
  → cron/auto-end 或手动 PATCH status=ended
  → 相关兑换码不再可用
```

### 7.2 公告推送链路

```
创建公告（管理端）
  → PATCH 发布（status=true, is_published=true）
  → broadcastAnnouncement() 站内信广播
    → 无事务保护（分片插入，性能优先）
    → 推送失败不阻断发布
  
用户端
  → GET /api/v1/announcements（可见已发布公告）
  → POST /api/v1/announcements/:id/read（标记已读）
  → announcement_reads 表记录
  
定时公告
  → cron/publish-scheduled-announcements.ts（每分钟）
  → 查 announcements WHERE is_published=false AND scheduledAt <= NOW()
  → 发布 + 广播
```

### 7.3 实时活动流链路

```
外部 API 调用
  → router 完成调用
  → activity-push-service.publish()
    → Redis PUBLISH
    → WebSocket 客户端接收
    → 前端渲染活动流

不依赖数据库（纯 Redis Pub/Sub + 内存连接池）
多实例支持（跨实例通过 Redis 通道广播）
```

### 7.4 依赖模块

| 模块 | 路径 | 类型 | 说明 |
|------|------|------|------|
| `campaigns/` | `routes/admin/campaigns/` | 路由 | 活动 CRUD + 码管理 |
| `redemption.ts` + `redemption-user.ts` | `routes/` | 路由 | 兑换码用户端接口 |
| `redemption-gift.ts` | `routes/` | 路由 | 兑换码转赠 |
| `redemption-fraud.ts` | `routes/admin/redemption-fraud.ts` | 路由 | 兑换风控 |
| `agent-redemption.ts` | `routes/admin/agent-redemption.ts` | 路由 | 代理生成兑换码 |
| `announcements.ts` | `routes/admin/announcements.ts` | 路由 | 公告管理 |
| `announcements.ts` | `routes/announcements.ts` | 路由 | 公告用户端 |
| `email-templates.ts` | `routes/admin/email-templates.ts` | 路由 | 邮件模板 |
| `email/` | `services/email/` | 服务 | 邮件发送 |
| `activity-push-service.ts` | `services/activity-push-service.ts` | 服务 | 实时活动推送 |
| `redemption-notify.ts` | `services/redemption-notify.ts` | 服务 | 兑换通知 |
| `redemption-scheduler.ts` | `services/redemption-scheduler.ts` | 服务 | 兑换调度 |
| `publish-announcements.ts` | `cron/publish-announcements.ts` | Cron | 公告发布 |
| `publish-scheduled-announcements.ts` | `cron/publish-scheduled-announcements.ts` | Cron | 定时公告 |
| `end-campaigns.ts` | `cron/end-campaigns.ts` | Cron | 自动结束活动 |

### 7.5 关联文档

| 文档 | 关联内容 |
|------|---------|
| [PRD-README.md §4.5](../PRD-README.md#45-营销与运营精化) | 营销总纲 |
| [PRD-README.md §3](../PRD-README.md#3-代理商体系) | 代理分配额度关联 |
| [ref-3-agent-system.md](ref-3-agent-system.md) | 代理佣金规则关联 |
| [ref-4.4-finance.md](ref-4.4-finance.md) | 余额增减关联 |
| [ref-4.6-security.md](ref-4.6-security.md) | 兑换风控/安全事件 |

### 7.6 关键约束

1. **活动预算不可超支**：发放奖励总额不超过 `budgetAmount`
2. **兑换码状态只进不退**：`unused → used | expired | revoked`（不可逆转）
3. **已使用码不可转赠**：只有 `unused` 状态的码可转赠
4. **公告广播无事务保护**：500 条/片插入，推送失败不影响公告发布
5. **邮件模板变量安全**：变量值在渲染前做 HTML 转义
6. **兑换风控优先**：风控检测在兑换逻辑之前执行
7. **活动自动结束**：`autoEnd=1` 且到达 endAt → cron 自动结束，不再生成新码

---

> **文档版本**：v1.0 — 2026-07-28
> **编写依据**：`api/src/db/schema/campaigns.ts`, `api/src/db/schema/redemption.ts`, `api/src/db/schema/code-templates.ts`, `api/src/routes/admin/campaigns/`, `api/src/routes/admin/announcements.ts`, `api/src/routes/admin/email-templates.ts`, `api/src/routes/admin/redemption-fraud.ts`, `api/src/routes/announcements.ts`, `api/src/routes/redemption-user.ts`, `api/src/routes/redemption-gift.ts`, `api/src/routes/agent/redemption.ts`, `api/src/services/activity-push-service.ts`, `api/src/cron/`
> **下一步建议**：活动类型扩展（充值满赠/消费返利/新客立减触发逻辑）、兑换码批量导出 CSV、公告富文本编辑器选型
