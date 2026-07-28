# 自定义通知规则与分群推送 — 深化参考文档

> **对应章节**：[PRD-README.md §4.5 营销运营](../PRD-README.md#45-营销与运营精化) — 深化模块
> **状态**：新功能。在已有公告/通知系统基础上增强运营定向触达能力。
> **定位**：运营可按用户分群、标签、行为条件精准圈选目标用户，通过多渠道发送营销/通知/服务消息。
> **粒度**：数据模型 → 通知规则 → 触达渠道 → API → 组件 Props

---

## 目录

1. [数据表结构](#1-数据表结构)
2. [通知规则配置](#2-通知规则配置)
3. [通知目标选择器](#3-通知目标选择器)
4. [多渠道触达](#4-多渠道触达)
5. [通知效果追踪](#5-通知效果追踪)
6. [API 接口规格](#6-api-接口规格)
7. [前端组件 Props](#7-前端组件-props)

---

## 1. 数据表结构

### 1.1 `notification_rules` — 通知规则

```typescript
export const notificationRules = pgTable("notification_rules", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  type: varchar("type", { length: 16 }).notNull(), // batch | scheduled | trigger
  description: varchar("description", { length: 512 }),
  
  // 目标
  targetType: varchar("target_type", { length: 16 }).notNull(), // all | segment | tags | conditions | manual
  segmentIds: jsonb("segment_ids").$type<number[]>(),           // 分群ID列表
  tagIds: jsonb("tag_ids").$type<number[]>(),                   // 标签ID列表
  conditions: jsonb("conditions").$type<FilterGroup>(),         // 条件筛选
  manualUserIds: jsonb("manual_user_ids").$type<number[]>(),    // 手动选中的用户
  
  // 生效范围
  excludeUserIds: jsonb("exclude_user_ids").$type<number[]>(),  // 排除用户
  excludeRole: jsonb("exclude_role").$type<string[]>(),         // 排除角色

  // 发送配置
  channels: jsonb("channels").$type<string[]>().notNull(),      // site_msg | email | announcement | banner
  templateId: integer("template_id"),                            // 内容模板
  content: text("content"),                                      // 或直接输入内容(HTML)
  priority: varchar("priority", { length: 8 }).default("normal"), // low | normal | high
  
  // 发送时机
  scheduleAt: timestamp("schedule_at", { withTimezone: true }), // 定时发送时间
  triggerEvent: varchar("trigger_event", { length: 64 }),       // 触发事件 (trigger类型)
  triggerDelayMinutes: integer("trigger_delay_minutes"),         // 触发后延迟发送

  // 状态与统计
  status: varchar("status", { length: 16 }).notNull().default("draft"), // draft | pending | sending | sent | stopped | failed
  targetCount: integer("target_count").default(0),               // 预计送达人数
  sentCount: integer("sent_count").default(0),                   // 已发送
  readCount: integer("read_count").default(0),                   // 已读
  clickCount: integer("click_count").default(0),                 // 点击
  startedAt: timestamp("started_at", { withTimezone: true }),    // 开始发送时间
  completedAt: timestamp("completed_at", { withTimezone: true }), // 发送完成时间
  
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 索引
notification_rules_status_idx — on(status)
notification_rules_type_idx  — on(type)
```

### 1.2 `notification_rule_sends` — 发送记录

```typescript
export const notificationRuleSends = pgTable("notification_rule_sends", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").notNull().references(() => notificationRules.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id),
  channel: varchar("channel", { length: 16 }).notNull(),   // 发送渠道
  status: varchar("status", { length: 16 }).notNull(),     // pending | sent | failed | bounced
  sentAt: timestamp("sent_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
  clickedAt: timestamp("clicked_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 索引
notification_rule_sends_rule_idx  — on(ruleId)
notification_rule_sends_user_idx  — on(userId)
```

### 1.3 `notification_templates` — 通知内容模板

```typescript
export const notificationTemplates = pgTable("notification_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  type: varchar("type", { length: 32 }).notNull(),          // site_msg | email | announcement | banner
  subject: varchar("subject", { length: 256 }),              // 邮件主题/站内信标题
  content: text("content").notNull(),                        // HTML内容
  variables: jsonb("variables").$type<VariableDef[]>(),      // 可用变量定义
  category: varchar("category", { length: 32 }),             // 模板分类
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

interface VariableDef {
  key: string;          // "{{user.nickname}}"
  label: string;        // "用户昵称"
  type: "string" | "number" | "date";
  required: boolean;
  defaultValue?: string;
}
```

**模板变量系统**：

| 变量 | 说明 | 示例 |
|------|------|------|
| `{{user.nickname}}` | 用户昵称 | "张三" |
| `{{user.balance}}` | 账户余额 | "¥234.50" |
| `{{user.monthly_spend}}` | 本月消费 | "¥890.50" |
| `{{platform.name}}` | 平台名称 | "3cloud" |
| `{{platform.url}}` | 平台地址 | "https://unmisa.com" |
| `{{date.now}}` | 当前日期 | "2026-07-28" |
| `{{action.url}}` | 操作链接 | "https://unmisa.com/recharge" |
| `{{custom}}` | 自定义变量 | 运营填写 |

---

## 2. 通知规则配置

### 2.1 三种发送模式

**批量发送（batch）**：
- 一次性推送给满足条件的用户
- 创建时确定目标人群 → 点击发送 → 一次完成
- 适用场景：活动通知、功能更新公告、促销信息

**定时发送（scheduled）**：
- 设定未来时间 → 到点自动发送
- 到点时重新计算目标人群（适用于动态分群）
- 发送前 1 小时可修改/取消
- 适用场景：节假日问候、周期性通知、活动开始提醒

**触发式发送（trigger）**：
- 监听系统事件 → 满足触发条件 → 自动发送
- 事件列表：用户注册 / 首次充值 / 余额低于阈值 / 连续3天无调用 / Key 即将过期
- 触发后可设置延迟（如注册后 24 小时发送引导消息）
- 适用场景：Onboarding 引导、流失召回、充值提醒

### 2.2 目标选择器（复用圈选引擎）

通知目标可通过以下方式组合（取并集）：

| 方式 | 说明 |
|------|------|
| 全平台 | 所有用户 |
| 指定分群 | 选择一个或多个 user_segments |
| 指定标签 | 选择标签，打到任意一个标签即匹配 |
| 条件筛选 | 使用圈选引擎 FilterBuilder 定义条件 |
| 手动选择 | 从用户列表手动勾选用户 |
| 排除项 | 可额外排除指定用户/角色（交集剔除） |

**目标预览**：选择目标后实时显示预估推送人数

### 2.3 发送前确认

```
┌─ 发送确认 ────────────────────────────┐
│ 通知名称: 七月新模型上线通知            │
│ 目标人群: 高价值开发者 (156人)          │
│ 发送渠道: 站内信 + 邮件                │
│ 发送时间: 立即发送                      │
│                                        │
│ ⚠️ 以下用户将收到此通知：               │
│   · 预计推送 156 人                    │
│   · 已排除已注销/禁用用户 0 人          │
│                                        │
│ ┌─ 预览 ──────────────────────────┐   │
│ │ 标题: 七月新模型上线通知           │   │
│ │ 内容: 尊敬的张三，我们上架了...     │   │
│ │        [查看全部 →]               │   │
│ └──────────────────────────────────┘   │
│                                        │
│ [发送测试给自己]  [取消]  [确认发送]    │
└────────────────────────────────────────┘
```

**安全限制**：
- 单次推送上限：100,000 人
- 同一用户 1 小时内最多接收 3 条通知
- 相同标题+内容的通知 24h 内不可重复发送

---

## 3. 通知目标选择器

### 3.1 通用组件：NotificationTargetSelector

```typescript
interface NotificationTargetSelectorProps {
  value: NotificationTarget;
  onChange: (target: NotificationTarget) => void;
  showEstimate?: boolean;    // 是否显示预估人数
}

interface NotificationTarget {
  targetType: "all" | "segment" | "tags" | "conditions" | "manual";
  segmentIds?: number[];
  tagIds?: number[];
  conditions?: FilterGroup;
  manualUserIds?: number[];
  excludeUserIds?: number[];
  excludeRole?: string[];
}
```

**UI 交互**：

```
┌─ 选择推送目标 ────────────────────────────┐
│ ○ 全平台用户                                │
│ ○ 指定分群: [高价值开发者 ×] [活跃用户 ×]   │
│            [+ 添加分群]                     │
│ ○ 指定标签: [企业认证 ×] [GPT系 ×]          │
│            [+ 添加标签]                     │
│ ○ 条件筛选: [配置筛选条件 →]                │
│ ○ 手动选择: [从用户列表选择 →] (已选 23 人) │
│                                             │
│ ─ 排除设置 ─                                │
│ 排除角色: [admin ×] [agent ×]               │
│ 排除用户: [搜索添加 →]                      │
│                                             │
│ 📊 预估推送人数: 1,234 人                   │
└─────────────────────────────────────────────┘
```

---

## 4. 多渠道触达

### 4.1 站内信（site_msg）

| 属性 | 说明 |
|------|------|
| 展示位置 | 用户端通知中心 (`/console/notifications`) |
| 消息格式 | 可含 HTML 链接/按钮 |
| 已读/未读 | 自动追踪 |
| 推送限制 | 无（站内信无成本） |
| 适用场景 | 运营通知、系统消息、账户变动 |

**消息卡片格式**：
```
┌─────────────────────────────────────┐
│ 📢 新功能上线    2小时前            │
│ 3cloud 已上线 deepseek-v4-flash...  │
│ [查看详情] [忽略]                    │
└─────────────────────────────────────┘
```

### 4.2 邮件（email）

| 属性 | 说明 |
|------|------|
| 发送方式 | 异步队列，批量发送 |
| 发送频率 | 每分钟最多 100 封 |
| 退订 | 邮件底部包含退订链接，退订后不再推送 |
| 追踪 | 送达率 / 打开率 / 点击率 |
| 应用场景 | 营销活动、重要通知、召回邮件 |

**邮件模板规格**：
- 使用通知模板定义
- 支持 HTML + 内联 CSS
- 自动替换模板变量
- 顶部平台统一 Header + Logo
- 底部统一 Footer（含退订链接）

### 4.3 全站公告（announcement）

| 属性 | 说明 |
|------|------|
| 展示位置 | 用户端顶部横幅 / 侧边栏顶部 |
| 展示时间 | 可设定开始/结束时间 |
| 关闭行为 | 关闭后本次会话不再展示（cookie级） |
| 推送逻辑 | 如果只针对分群推送，非目标用户不可见 |
| 适用场景 | 系统维护通知、活动倒计时、重要公告 |

### 4.4 Banner 横幅（banner）

| 属性 | 说明 |
|------|------|
| 展示位置 | 控制台首页顶部 / 模型中心顶部 |
| 素材格式 | 图片 (PNG/JPG, 1920×200 或 自适应) |
| 链接 | 可点击跳转 |
| 展示规则 | 按分群定向展示、按时间展示、按频次 |
| 适用场景 | 新模型宣传、活动推广、充值优惠 |

---

## 5. 通知效果追踪

### 5.1 实时统计看板

**路径**：`/admin/notifications/rules/:id/stats`

| 指标 | 计算方式 | 展示 |
|------|---------|------|
| 目标人数 | targetCount | 数字 |
| 已发送 | sentCount | 数字 + 进度条（sentCount / targetCount） |
| 送达率 | sentCount / targetCount | 百分比 |
| 已读率 | readCount / sentCount | 百分比（仅站内信/邮件有） |
| 点击率 | clickCount / sentCount | 百分比（仅含链接的消息） |
| 退订率 | unsubCount / sentCount | 百分比（仅邮件有） |

### 5.2 各渠道效果对比

```
不同渠道的效果对比：
  站内信: 发送 1,234 → 已读 890 (72.1%) → 点击 234 (19.0%)
  邮件:   发送 1,234 → 送达 1,200 (97.2%) → 打开 456 (38.0%) → 点击 89 (7.4%)
```

### 5.3 通知规则列表

| 列 | 说明 |
|----|------|
| 名称 | 规则名称 |
| 类型 | batch/scheduled/trigger |
| 目标人数 | 预估推送人数 |
| 发送状态 | draft/pending/sending/sent/stopped/failed |
| 已发送 | sentCount |
| 已读率 | readCount / sentCount |
| 发送时间 | scheduled/已发送的时间 |
| 操作 | 查看/编辑/复制/删除/暂停/重发 |

---

## 6. API 接口规格

### 6.1 通知规则 CRUD

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/notification-rules` | 规则列表 | USER_VIEW |
| POST | `/api/v1/admin/notification-rules` | 创建规则 | USER_EDIT |
| GET | `/api/v1/admin/notification-rules/:id` | 规则详情 | USER_VIEW |
| PATCH | `/api/v1/admin/notification-rules/:id` | 编辑规则 | USER_EDIT |
| DELETE | `/api/v1/admin/notification-rules/:id` | 删除规则 | USER_EDIT |
| POST | `/api/v1/admin/notification-rules/:id/send` | 发送/确认发送 | USER_EDIT |
| POST | `/api/v1/admin/notification-rules/:id/stop` | 停止发送 | USER_EDIT |
| POST | `/api/v1/admin/notification-rules/:id/test` | 测试发送(自己) | USER_EDIT |

### 6.2 模板管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/notification-templates` | 模板列表 | USER_VIEW |
| POST | `/api/v1/admin/notification-templates` | 创建模板 | USER_EDIT |
| PATCH | `/api/v1/admin/notification-templates/:id` | 编辑模板 | USER_EDIT |
| DELETE | `/api/v1/admin/notification-templates/:id` | 删除模板 | USER_EDIT |

### 6.3 效果统计

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/notification-rules/:id/stats` | 规则级别统计 | USER_VIEW |
| GET | `/api/v1/admin/notification-rules/:id/sends` | 发送详情列表 | USER_VIEW |
| GET | `/api/v1/admin/notification-stats/overview` | 全局通知效果总览 | USER_VIEW |

### 6.4 目标人数预估

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/v1/admin/notification-rules/estimate` | 预估目标人数 | USER_VIEW |

**请求体**：
```json
{
  "targetType": "segment",
  "segmentIds": [1, 3],
  "excludeRole": ["admin"]
}
```

**响应**：
```json
{
  "code": 0,
  "data": {
    "estimatedCount": 1234,
    "breakdown": {
      "bySegment": [
        { "segmentId": 1, "segmentName": "高价值开发者", "count": 156 },
        { "segmentId": 3, "segmentName": "活跃用户", "count": 1078 }
      ],
      "excluded": 12
    }
  }
}
```

---

## 7. 前端组件 Props

### 7.1 NotificationRuleEditor — 规则编辑

```typescript
interface NotificationRuleEditorProps {
  mode: "create" | "edit";
  ruleId?: number;
  onSave: () => void;
}

interface NotificationRuleFormData {
  name: string;
  type: "batch" | "scheduled" | "trigger";
  target: NotificationTarget;
  channels: string[];
  templateId?: number;
  content?: string;
  scheduleAt?: string;
  triggerEvent?: string;
  triggerDelayMinutes?: number;
}
```

### 7.2 NotificationRuleList — 规则列表

```typescript
interface NotificationRuleListProps {
  // 页面级组件
}

interface NotificationRuleItem {
  id: number;
  name: string;
  type: string;
  targetType: string;
  targetCount: number;
  channels: string[];
  status: string;
  sentCount: number;
  readCount: number;
  scheduledAt?: string;
  createdAt: string;
}
```

### 7.3 ContentTemplateEditor — 模板编辑器

```typescript
interface ContentTemplateEditorProps {
  template?: NotificationTemplate;
  channelType: string; // site_msg | email | announcement | banner
  onSave: (template: NotificationTemplate) => void;
}

interface NotificationTemplate {
  id?: number;
  name: string;
  type: string;
  subject?: string;
  content: string;  // HTML
  variables: { key: string; label: string; type: string }[];
}
```

### 7.4 NotificationStatsDashboard — 效果统计看板

```typescript
interface NotificationStatsDashboardProps {
  ruleId: number;
}

interface NotificationStats {
  summary: {
    targetCount: number;
    sentCount: number;
    readCount: number;
    clickCount: number;
    deliveryRate: number;
    readRate: number;
    clickRate: number;
  };
  byChannel: {
    channel: string;
    sent: number;
    delivered: number;
    read: number;
    clicked: number;
  }[];
  timeline: {
    hour: string;
    sent: number;
    read: number;
  }[];
}
```

---

## 交叉引用

| 关联模块 | 文档 | 关系 |
|---------|------|------|
| 用户分群 | ref-4.10-user-segmentation.md | 通知目标选择器复用分群+标签+圈选引擎 |
| 公告系统 | ref-4.5-marketing.md §3 | 定向公告推送 |
| 邮件模板 | ref-4.5-marketing.md §4 | 复用邮件模板系统 |
| 通知中心 | PRD-README.md §2.2 | 站内信汇入通知中心 |
| 运营大屏 | ref-4.12-dashboard-pro.md | 通知效果数据展示 |
| 资源位管理 | ref-4.15-resource-placement.md | Banner 渠道联动（下个模块） |
