# 用户分群与标签系统 — 深化参考文档

> **对应章节**：[PRD-README.md §2 用户体系](../PRD-README.md#二用户体系) — 新增模块
> **状态**：新功能，尚未实现。本文档为运营平台深化需求规格。
> **定位**：支持运营人员按任意维度圈选用户、打标签、构建动态/静态分群，实现精细化运营触达。
> **粒度**：Schema 字段定义 → API 接口 → 前端组件 Props → 运营策略 → 交叉引用

---

## 目录

1. [数据表结构](#1-数据表结构)
2. [标签管理](#2-标签管理)
3. [分群管理](#3-分群管理)
4. [圈选引擎](#4-圈选引擎)
5. [分群画像分析](#5-分群画像分析)
6. [运营联动](#6-运营联动)
7. [API 接口规格](#7-api-接口规格)
8. [前端组件 Props](#8-前端组件-props)

---

## 1. 数据表结构

### 1.1 `user_tags` — 用户标签定义

```typescript
export const userTags = pgTable("user_tags", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  color: varchar("color", { length: 7 }).notNull().default("#3B82F6"), // hex color
  description: varchar("description", { length: 256 }),
  category: varchar("category", { length: 32 }).notNull(), // 标签分类
  source: varchar("source", { length: 16 }).notNull().default("manual"), // manual | auto_rule | import
  autoRuleId: integer("auto_rule_id").references(() => autoTagRules.id), // 自动打标规则
  userCount: integer("user_count").notNull().default(0), // 打标用户数（缓存）
  isSystem: boolean("is_system").notNull().default(false), // 系统内置标签不可删除
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 索引
user_tags_category_idx — on(category)
user_tags_source_idx  — on(source)
```

**标签分类（category）预设**：

| 分类 | 说明 | 系统预置标签示例 |
|------|------|---------------|
| `lifecycle` | 用户生命周期 | 新注册、活跃、沉睡、流失 |
| `consumption` | 消费行为 | 高消费、中消费、低消费、零消费 |
| `identity` | 身份属性 | 企业认证、个人认证、未认证 |
| `channel` | 来源渠道 | 自然流量、代理引入、活动引流 |
| `model` | 模型偏好 | GPT系、DeepSeek系、Claude系、多模型 |
| `custom` | 自定义 | 运营自定义标签 |

### 1.2 `user_tag_mappings` — 用户-标签关联

```typescript
export const userTagMappings = pgTable("user_tag_mappings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull().references(() => userTags.id, { onDelete: "cascade" }),
  source: varchar("source", { length: 16 }).notNull().default("manual"), // manual | auto_rule | import
  autoRuleId: integer("auto_rule_id").references(() => autoTagRules.id),
  operatorId: integer("operator_id").references(() => users.id), // 操作人
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userTagUnique: uniqueIndex("uk_user_tag").on(table.userId, table.tagId),
}));

// 索引
user_tag_mappings_user_idx — on(userId)
user_tag_mappings_tag_idx  — on(tagId)
```

### 1.3 `auto_tag_rules` — 自动打标规则

```typescript
export const autoTagRules = pgTable("auto_tag_rules", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  tagId: integer("tag_id").notNull().references(() => userTags.id, { onDelete: "cascade" }),
  description: varchar("description", { length: 512 }),
  conditions: jsonb("conditions").notNull().$type<FilterGroup>(), // 筛选条件组
  isEnabled: boolean("is_enabled").notNull().default(true),
  schedule: varchar("schedule", { length: 32 }).notNull().default("daily"), // daily | hourly | realtime | manual
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastRunCount: integer("last_run_count").default(0), // 上次打标人数
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 索引
auto_tag_rules_tag_idx   — on(tagId)
auto_tag_rules_enabled_idx — on(isEnabled)
```

### 1.4 `user_segments` — 用户分群

```typescript
export const userSegments = pgTable("user_segments", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: varchar("description", { length: 512 }),
  type: varchar("type", { length: 16 }).notNull().default("static"), // static | dynamic
  conditions: jsonb("conditions").$type<FilterGroup | null>(), // dynamic 类型有筛选条件
  memberCount: integer("member_count").notNull().default(0), // 成员数缓存
  refreshInterval: varchar("refresh_interval", { length: 16 }), // dynamic: daily | hourly | realtime
  lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }),
  status: varchar("status", { length: 16 }).notNull().default("active"), // active | archived
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 索引
user_segments_type_idx   — on(type)
user_segments_status_idx — on(status)
```

### 1.5 `user_segment_members` — 分群成员

```typescript
export const userSegmentMembers = pgTable("user_segment_members", {
  id: serial("id").primaryKey(),
  segmentId: integer("segment_id").notNull().references(() => userSegments.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  addedBy: varchar("added_by", { length: 16 }).notNull(), // manual | auto | import
}, (table) => ({
  segmentUserUnique: uniqueIndex("uk_segment_user").on(table.segmentId, table.userId),
}));

// 索引
user_segment_members_segment_idx — on(segmentId)
user_segment_members_user_idx    — on(userId)
```

### 1.6 `user_segment_snapshots` — 分群快照

```typescript
export const userSegmentSnapshots = pgTable("user_segment_snapshots", {
  id: serial("id").primaryKey(),
  segmentId: integer("segment_id").notNull().references(() => userSegments.id, { onDelete: "cascade" }),
  memberCount: integer("member_count").notNull(),
  snapshotData: jsonb("snapshot_data").notNull().$type<SegmentSnapshotData>(),
  snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull().defaultNow(),
});

// 索引
user_segment_snapshots_seg_time — on(segmentId, snapshotAt)
```

**SegmentSnapshotData 类型**：
```typescript
interface SegmentSnapshotData {
  tagDistribution: { tagId: number; tagName: string; count: number; ratio: number }[];
  consumptionRange: { range: string; count: number }[];
  modelPreference: { modelName: string; count: number; ratio: number }[];
  avgMonthlySpend: number;
  activeRate: number;
}
```

---

## 2. 标签管理

### 2.1 标签 CRUD

**标签列表页**

| 功能 | 说明 |
|------|------|
| 标签列表 | 按分类 tab 分组，卡片网格展示 |
| 排序 | 拖拽排序（sort_order） |
| 搜索 | 按标签名模糊搜索 |
| 筛选 | 按分类、来源筛选 |
| 每个标签卡片 | 显示名称、颜色、分类、来源、打标人数 |
| 系统标签 | 带"🔒 系统"标记，不可编辑删除 |

**创建/编辑标签弹窗**

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| 标签名 | ✅ | text(64) | 全局唯一，如"高价值用户" |
| 颜色 | ✅ | color picker | 默认 #3B82F6，影响卡片和标注颜色 |
| 分类 | ✅ | select | lifecycle / consumption / identity / channel / model / custom |
| 描述 | ❌ | textarea(256) | 说明标签用途和打标规则 |

**标签操作**

| 操作 | 限制 | 说明 |
|------|------|------|
| 编辑 | 系统标签不可编辑 | 修改名称/颜色/分类/描述 |
| 删除 | 系统标签不可删除；有关联用户时二次确认 | 删除标签同时清除所有用户关联 |
| 合并 | — | 将标签 B 合并到标签 A，所有关联用户转移 |
| 停用 | — | 隐藏但保留数据和关联（软删除） |

### 2.2 手动打标/去标

**用户列表批量操作**：

```
选中用户 → [批量打标] → 选择标签 → 确认
  └── 批量操作支持 添加标签 / 移除标签 / 替换标签
```

**用户详情页**：
- 标签区域展示用户已有标签（彩色 tag 组件）
- 点击 "+" 按钮弹出标签选择器
- 点击标签上的 "×" 去标
- 单个用户操作立即生效

**权限要求**：`USER_EDIT` 

### 2.3 自动打标规则

**规则创建**：

| 步骤 | 内容 |
|------|------|
| 1. 选择目标标签 | 将规则匹配的用户打上哪个标签 |
| 2. 设置筛选条件 | 使用圈选引擎生成 conditions JSON |
| 3. 设置执行频率 | realtime(实时)/ hourly(每小时)/ daily(每日)/ manual(手动) |
| 4. 启用规则 | 创建后默认启用 |

**执行逻辑**：

```
realtime: 用户事件触发时检查（注册/充值/首次调用/高额消费）
  → 满足条件 → 立即打标
  → 不满足且有此标签 → 移除标签

hourly/daily: cron 批量扫描满足条件的用户
  → 条件匹配 → 打标
  → 条件不匹配但已有标签 → 移除标签（脏数据清理）

manual: 手动执行按钮 → 批量扫描一次
```

**执行日志**：

| 字段 | 说明 |
|------|------|
| 规则名称 | 对应 auto_tag_rules.name |
| 执行时间 | 开始执行的时间 |
| 新增打标 | 本次新增打标人数 |
| 移除标签 | 本次移除标签人数 |
| 总耗时 | ms |
| 状态 | 成功/部分失败/失败 |

---

## 3. 分群管理

### 3.1 分群列表页

| 列 | 说明 |
|----|------|
| 分群名称 | 可点击进入详情 |
| 类型 | "静态"（手动维护） / "动态"（条件自动刷新） |
| 成员数 | 当前成员数量 |
| 上次刷新 | 动态分群的最后一次刷新时间 |
| 创建时间 | — |
| 状态 | active / archived |
| 操作 | 编辑 / 查看成员 / 刷新(动态) / 导出 / 归档 / 删除 |

**筛选**: 按类型(static/dynamic)、状态(active/archived)筛选

### 3.2 创建分群

**静态分群**：
```
① 填写基本信息（名称、描述）
② 从用户列表批量选择成员
   - 支持标签筛选快速定位
   - 支持搜索用户昵称/邮箱/ID
   - 支持导入 CSV/粘贴 ID 列表
③ 确认创建 → 成员关系写入 user_segment_members
```

**动态分群**：
```
① 填写基本信息（名称、描述）
② 配置圈选条件（使用圈选引擎 UI）
③ 设置刷新频率（realtime/ hourly/ daily）
④ 预览预估人数
⑤ 确认创建 → 首次同步成员
```

### 3.3 分群详情页

**分群画像卡片**（参考 §5）：

```
┌─────────────────────────────────────────────────┐
│ 分群「高价值开发者」             静态 | 156人      │
│ 最后更新: 2026-07-28 10:00                       │
├─────────────────────────────────────────────────┤
│ 📊 画像概览                                      │
│  标签分布: 企业认证 68% | GPT系 52% | ...        │
│  月均消费: ¥890avg                               │
│  活跃率: 78% (近30天有调用)                      │
├─────────────────────────────────────────────────┤
│ 📥 成员列表 (分页)                               │
│  用户ID | 昵称 | 注册时间 | 月消费 | 标签        │
├─────────────────────────────────────────────────┤
│ [导出成员] [推送消息] [创建营销活动]              │
└─────────────────────────────────────────────────┘
```

**成员管理（静态分群）**：
- 添加成员：搜索用户 → 选择 → 添加
- 移除成员：单个移除 / 批量选中移除
- 批量导入：CSV/粘贴 ID → 预览 → 确认添加

**操作记录**：

| 记录项 | 说明 |
|--------|------|
| 时间 | 操作时间 |
| 操作人 | 管理员昵称 |
| 操作 | 创建/添加成员/移除成员/修改条件/手动刷新 |
| 详情 | 操作前后变化 |

---

## 4. 圈选引擎

圈选引擎是分群和自动打标的核心交互组件，让运营人员通过可视化条件组合来圈选用户。

### 4.1 筛选条件类型

**用户属性维度**：

| 维度 | 操作符 | 值类型 | 示例 |
|------|--------|--------|------|
| 注册时间 | =, >=, <=, between | 日期 | "注册时间 between 2026-01-01 and 2026-06-30" |
| 角色 | =, in | 多选 | "角色 in [user, agent]" |
| 状态 | =, in | 多选 | "状态 = active" |
| 实名状态 | = | select | "实名状态 = approved" |
| VIP 等级 | >=, = | 数字 | "VIP >= 2" |
| 标签 | has_any, has_all, not_has | 多选 | "标签 has_any [企业认证, 高消费]" |
| 代理归属 | =, in, not_null | select | "代理归属 = agent_3" |

**消费行为维度**：

| 维度 | 操作符 | 值类型 | 示例 |
|------|--------|--------|------|
| 累计消费 | >=, <=, between | 金额 | "累计消费 >= 1000" |
| 近7天消费 | >=, <=, between | 金额 | "近7天消费 between 100 and 1000" |
| 近30天消费 | >=, <=, between | 金额 | "近30天消费 < 10" |
| 账户余额 | >=, <=, = | 金额 | "余额 = 0" |
| 充值次数 | >=, = | 整数 | "充值次数 >= 2" |
| 首次充值时间 | >=, between | 日期 | "首次充值 >= 2026-06-01" |
| 最后一次充值距今 | >=, <= | 天数 | "最后充值距今 > 30" |

**调用行为维度**：

| 维度 | 操作符 | 值类型 | 示例 |
|------|--------|--------|------|
| 总调用次数 | >=, <=, between | 整数 | "总调用 >= 1000" |
| 近7天调用次数 | >=, <=, = | 整数 | "近7天调用 = 0" |
| 近30天调用次数 | >=, <= | 整数 | "近30天调用 > 100" |
| 常用模型 | has_any, has_all | 多选 | "常用模型 has_any [deepseek-chat, gpt-4o]" |
| 成功率 | >=, <= | 百分比 | "成功率 < 80%" |
| 平均延迟 | >= | 毫秒 | "平均延迟 > 5000" |
| 最后调用距今 | >=, <= | 天数 | "最后调用距今 > 30" |
| Key 数量 | >=, <=, = | 整数 | "Key数量 >= 3" |

**来源维度**：

| 维度 | 操作符 | 值类型 | 示例 |
|------|--------|--------|------|
| 注册来源 | =, in | select | "来源 = campaign:summer-2026" |
| 邀请人 | = | user select | "邀请人 = u_xxxx" |
| 首次接入渠道 | =, in | select | "首次接入 = web_console" |

### 4.2 条件组合规则

```typescript
interface FilterGroup {
  logic: "and" | "or";     // 组内逻辑
  filters: FilterRule[];   // 条件列表
  groups?: FilterGroup[];  // 嵌套条件组（最多 3 层）
}

interface FilterRule {
  dimension: string;        // 筛选维度
  operator: string;         // 操作符
  value: any;              // 值
}
```

**前端 UI 交互**：
```
┌─ 圈选条件 ────────────────────────────────────┐
│ 满足 [全部 ▼] 条件                             │
│                                                │
│ ┌─ 条件组 1 ────────────────────────────── [×] │
│ │  注册时间 between █████ and █████       [×]  │
│ │  角色 in [user ▼] [agent ▼]             [×]  │
│ │  [+ 添加条件]                                │
│ └──────────────────────────────────────────────│
│                                                │
│ [+ 添加条件组]                                  │
│                                                │
│ 📊 预估匹配人数: 1,234 人  [查看样本 →]        │
└────────────────────────────────────────────────┘
```

### 4.3 条件预览与估算

- 点击"预估匹配人数"触发后端 COUNT 查询
- 如果超过 1000 人，显示 "1,000+" 并标注"开启后精确计数"
- 前端展示预估人数的同时，提供"查看样本"功能（返回前 20 条用户记录）
- 人数随条件变更实时重新估算（防抖 500ms）

---

## 5. 分群画像分析

### 5.1 标签分布

```
按标签统计分群内各标签占比（Top 10）
柱状图：标签名 → 人数
```

**数据来源**：`user_tag_mappings` JOIN `user_segment_members` 聚合。

### 5.2 消费分层

| 分层 | 范围 | 分群内人数 | 分群内占比 | 全平台平均占比 |
|------|------|----------|----------|-------------|
| 高消费 | 月消费 > ¥1000 | 34 | 21.8% | 5.0% |
| 中消费 | ¥100-1000 | 89 | 57.1% | 15.0% |
| 低消费 | ¥10-100 | 28 | 17.9% | 30.0% |
| 零消费 | ¥0-10 | 5 | 3.2% | 50.0% |

### 5.3 模型偏好

```
分群内用户常用模型 Top 10
饼图/条形图：模型名 → 用户数 → 占比
与全平台对比（虚线参考线）
```

### 5.4 时间维度分析

- 新增趋势：分群内用户按注册月份分布
- 活跃趋势：分群内用户近 30 天活跃天数分布
- 如果分群人数过少（< 50），部分图表替换为"样本不足，无法展示统计"占位

### 5.5 自定义对比

```
选择两个分群进行对比：
  ┌─ 对比分群 ──────────────────────────────────┐
  │ 分群A: [高价值开发者 ▼]  分群B: [全平台 ▼]   │
  │                                              │
  │ 📊 对比维度                                   │
  │  月均消费: ¥890  vs  ¥123  (+623%)           │
  │  企业认证率: 68%  vs  12%  (+467%)           │
  │  Key数平均: 3.2    vs  1.1  (+191%)          │
  │  活跃率(30d): 78%  vs  35%  (+123%)          │
  │                                              │
  │ [详细对比图表]                                 │
  └──────────────────────────────────────────────┘
```

---

## 6. 运营联动

### 6.1 与通知推送联动

分群创建后，在通知/消息模块可一键针对该分群发送推送：

```
推送目标: [选择分群 ▼] 高价值开发者 (156人)
推送渠道: ☑ 站内信  ☑ 邮件  ☐ 短信
推送模板: [选择模板 ▼]
推送时间: [立即发送 ▼] [定时发送]
```

### 6.2 与营销活动联动

活动可设置"目标分群"为受众人群：

```
活动受众: [全平台 ▼] / [指定分群 ▼]
  → 仅分群内用户可以参与/看到该活动
```

### 6.3 与资源位联动

Banner/弹窗等资源位可配置展示规则：

```
展示人群: [全平台 ▼] / [指定分群 ▼]
  → 仅分群内用户看到该资源位
```

### 6.4 数据导出

| 导出类型 | 格式 | 内容 |
|---------|------|------|
| 分群成员列表 | CSV/Excel | 用户ID、昵称、邮箱、注册时间、标签、月消费 |
| 分群画像报告 | PDF | 包含所有画像图表和数据表 |
| 分群快照 | JSON | 完整快照数据，用于历史对比 |

---

## 7. API 接口规格

### 7.1 标签管理 API

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/user-tags` | 标签列表（支持筛选/搜索） | USER_VIEW |
| POST | `/api/v1/admin/user-tags` | 创建标签 | USER_EDIT |
| PATCH | `/api/v1/admin/user-tags/:id` | 编辑标签 | USER_EDIT |
| DELETE | `/api/v1/admin/user-tags/:id` | 删除标签 | USER_EDIT |
| POST | `/api/v1/admin/user-tags/:id/merge` | 合并标签 | USER_EDIT |
| POST | `/api/v1/admin/user-tags/batch` | 批量打标/去标 | USER_EDIT |

**批量打标请求体**：
```json
{
  "userIds": [1, 2, 3],
  "tagIds": [5, 8],
  "action": "add"  // add | remove | replace
}
```

### 7.2 用户标签 API

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/users/:id/tags` | 获取用户标签 | USER_VIEW |
| POST | `/api/v1/admin/users/:id/tags` | 给用户打标签 | USER_EDIT |
| DELETE | `/api/v1/admin/users/:id/tags/:tagId` | 移除用户标签 | USER_EDIT |

### 7.3 自动打标规则 API

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/auto-tag-rules` | 规则列表 | USER_VIEW |
| POST | `/api/v1/admin/auto-tag-rules` | 创建规则 | USER_EDIT |
| PATCH | `/api/v1/admin/auto-tag-rules/:id` | 编辑规则 | USER_EDIT |
| DELETE | `/api/v1/admin/auto-tag-rules/:id` | 删除规则 | USER_EDIT |
| POST | `/api/v1/admin/auto-tag-rules/:id/execute` | 手动执行规则 | USER_EDIT |
| PATCH | `/api/v1/admin/auto-tag-rules/:id/toggle` | 启用/停用 | USER_EDIT |
| GET | `/api/v1/admin/auto-tag-rules/:id/logs` | 执行日志 | USER_VIEW |

### 7.4 分群管理 API

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/user-segments` | 分群列表 | USER_VIEW |
| POST | `/api/v1/admin/user-segments` | 创建分群 | USER_EDIT |
| GET | `/api/v1/admin/user-segments/:id` | 分群详情+成员列表 | USER_VIEW |
| PATCH | `/api/v1/admin/user-segments/:id` | 编辑分群 | USER_EDIT |
| DELETE | `/api/v1/admin/user-segments/:id` | 删除分群 | USER_EDIT |
| POST | `/api/v1/admin/user-segments/:id/refresh` | 手动刷新动态分群 | USER_EDIT |
| POST | `/api/v1/admin/user-segments/:id/members` | 添加成员(静态) | USER_EDIT |
| DELETE | `/api/v1/admin/user-segments/:id/members/:userId` | 移除成员(静态) | USER_EDIT |
| POST | `/api/v1/admin/user-segments/:id/members/batch` | 批量添加/移除 | USER_EDIT |
| GET | `/api/v1/admin/user-segments/:id/export` | 导出成员 CSV | USER_EDIT |
| GET | `/api/v1/admin/user-segments/:id/profile` | 分群画像数据 | USER_VIEW |
| GET | `/api/v1/admin/user-segments/:id/snapshots` | 历史快照列表 | USER_VIEW |
| GET | `/api/v1/admin/user-segments/compare` | 对比两个分群 | USER_VIEW |

### 7.5 圈选预览 API

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/v1/admin/segmentation/estimate` | 预估匹配人数 | USER_VIEW |
| POST | `/api/v1/admin/segmentation/preview` | 查看匹配样本（20条） | USER_VIEW |
| GET | `/api/v1/admin/segmentation/dimensions` | 获取可用筛选维度列表 | USER_VIEW |

**estimate 请求体**：
```json
{
  "conditions": {
    "logic": "and",
    "filters": [
      { "dimension": "registrationDate", "operator": "between", "value": ["2026-01-01", "2026-06-30"] },
      { "dimension": "monthlySpend", "operator": "gte", "value": 100 }
    ]
  }
}
```

**回应**：
```json
{
  "code": 0,
  "data": {
    "estimatedCount": 1234,
    "isExact": false
  }
}
```

---

## 8. 前端组件 Props

### 8.1 TagManagerPage — 标签管理页

```typescript
interface TagManagerPageProps {
  // 无外部 props，页面级组件
}

// 内部状态
interface TagManagerState {
  tags: UserTag[];
  activeCategory: string;
  searchKeyword: string;
  editingTag: UserTag | null;
  mergingTags: { from: UserTag; to: UserTag } | null;
}
```

### 8.2 SegmentSelector — 分群选择器（共用组件）

```typescript
interface SegmentSelectorProps {
  value: number | null;                    // 选中的分群ID
  onChange: (segmentId: number | null) => void;
  placeholder?: string;                    // 默认 "选择目标分群"
  allowAll?: boolean;                      // 是否显示"全平台"选项
  disabled?: boolean;
}
```

### 8.3 SegmentBuilder — 分群构建器

```typescript
interface SegmentBuilderProps {
  mode: "create" | "edit";
  initialData?: {
    name: string;
    description: string;
    type: "static" | "dynamic";
    conditions?: FilterGroup;
    memberIds?: number[]; // static mode
  };
  onSave: (data: SegmentFormData) => Promise<void>;
  onCancel: () => void;
}

interface SegmentFormData {
  name: string;
  description: string;
  type: "static" | "dynamic";
  conditions?: FilterGroup;
  memberIds?: number[];
  refreshInterval?: string;
}
```

### 8.4 FilterBuilder — 圈选条件构建器（核心组件）

```typescript
interface FilterBuilderProps {
  value: FilterGroup;
  onChange: (group: FilterGroup) => void;
  availableDimensions: DimensionDef[];
  onEstimate?: () => void;    // 预估人数回调
  estimatedCount?: number;
  isEstimating?: boolean;
}

interface DimensionDef {
  key: string;
  label: string;
  category: string;         // user | behavior | consumption | source
  operators: OperatorDef[];
  valueType: "string" | "number" | "date" | "select" | "multiSelect" | "amount" | "percent" | "days";
  options?: { label: string; value: any }[]; // select/multiSelect 的选项
}
```

### 8.5 SegmentProfile — 分群画像面板

```typescript
interface SegmentProfileProps {
  segmentId: number;
}

// 内部数据
interface SegmentProfileData {
  tagDistribution: { tagId: number; tagName: string; tagColor: string; count: number; ratio: number }[];
  consumptionDistribution: { range: string; count: number; ratio: number; platformAvgRatio: number }[];
  modelPreferences: { modelName: string; vendorName: string; count: number; ratio: number }[];
  lifecycleDistribution: { stage: string; count: number; ratio: number }[];
  summary: {
    totalMembers: number;
    avgMonthlySpend: number;
    activeRate: number;        // 近30天活跃率
    avgKeyCount: number;
    topTag: string;
    avgTenure: number;         // 平均注册天数
  };
}
```

### 8.6 UserTagInput — 用户标签编辑器

```typescript
interface UserTagInputProps {
  userIds: number[];           // 支持单个或批量
  existingTags?: UserTag[];    // 当前已有标签
  onTagsChange: (tagIds: number[]) => void;
  mode?: "inline" | "popover"; // 内联 or 弹出
}
```

---

## 交叉引用

| 关联模块 | 文档 | 关系 |
|---------|------|------|
| 用户管理 | ref-4.1-admin-dashboard.md | 用户详情页集成标签+分群入口 |
| 营销运营 | ref-4.5-marketing.md | 活动/公告可按分群定向推送 |
| 运营总纲 | ref-1-operational-summary.md | 分群画像数据汇入运营 KPI |
| 通知系统 | PRD-README.md §2.2 区域6 | 分群定向推送通知 |
| 新手引导 | PRD-README.md §2.2 区域10 | 自动打标"新用户"触发引导展示 |

---

## 边界条件

| # | 场景 | 触发条件 | 预期行为 |
|---|------|---------|---------|
| US-001 | 分群条件过多导致查询超时 | 圈选条件中组合维度 ≥ 8 个，或嵌套层级超过 3 层，或预估人数 > 50 万 | 后端对复杂查询设置超时（默认 10s），超时后返回错误提示"条件过于复杂，请简化筛选条件"；前端展示简化建议并阻止提交 |
| US-002 | 分群结果为空 | 圈选条件匹配人数为 0，或手动导入的用户 ID 均为无效/已注销用户 | 创建分群时弹出确认提示"当前条件匹配 0 位用户，是否继续创建"；创建后分群详情页展示空状态提示"暂无成员"，并建议修改圈选条件 |
| US-003 | 分群计算周期长于预期 | dynamic 类型分群配置 refreshInterval=daily，但全量扫描用户表（百万级）耗时超过 10 分钟 | 后台异步执行，不阻塞前端操作；更新分群列表的"上次刷新"时间为"计算中…"；完成后发送站内通知；若连续 3 次超时则自动降级为 manual 模式 |
| US-004 | 分群被删除仍有引用 | 已删除的分群仍被营销活动、通知推送或资源位规则引用为目标受众 | 删除分群前弹窗列出所有引用（活动数/通知数/资源位数）；强制管理员确认后变为"已归档"状态（软删除）而非物理删除；引用方在关联时自动标记"❌ 目标分群已删除" |
| US-005 | 批量打标/去标中途失败 | 对 1000+ 用户批量打标时，部分用户 ID 不存在或数据库写入出现唯一键冲突 | 事务分批处理（每次 200 条），记录失败明细；前端展示"成功 N 条，失败 M 条"及失败原因列表；提供"一键重试失败项"功能 |
| US-006 | 自动打标规则循环触发 | A 规则的输出条件恰好满足 B 规则的输入条件，且 B 规则的输出又反向触发 A 规则 | 单次执行周期内每个用户最多只评估一次每条规则；检测到循环依赖时记录 warning 日志，暂停相关规则并通知管理员 |

### 异常流程

| 场景 | 恢复策略 |
|------|---------|
| 圈选预估接口超时或返回异常 | 前端降级显示"预估失败"，允许用户跳过预览直接创建分群；后端重试 1 次后返回兜底估算值 |
| 动态分群刷新期间数据源变更 | 锁定刷新时的快照版本，刷新完成后与最新数据做增量合并；若冲突超过 5%，触发人工复核 |
| 标签合并过程中目标标签被删除 | 事务回滚，提示"目标标签已被删除"，建议重新选择合并目标 |
| 分群画像分析数据不足（成员 < 50） | 部分图表替换为"样本不足，无法展示统计"占位，避免误导性分布展示 |
