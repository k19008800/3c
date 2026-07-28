# 运营模板库 — 深化参考文档

> **对应章节**：[PRD-README.md §4.5 营销运营](../PRD-README.md#45-营销与运营精化) — 深化模块
> **状态**：已深化完成 ✅ | **版本**：v2.0 | **最后更新**：2026-07-28
> **定位**：沉淀运营最佳实践，提供活动/通知/Banner/公告/邮件/弹窗/兑换码/报表等场景的预置模板库，支持一键创建、变量替换、版本管理。
> **设计原则**：模板是"带参数的配置快照"，不是代码片段。模板使用后产生独立实例，互不影响。
> **粒度**：数据模型 → 模板变量系统 → 渲染引擎 → 8 类模板完整字段 → 导入导出 → API → 组件 → 配置 → 边界 → 验收

---

## 目录

1. [数据表结构](#1-数据表结构)
2. [模板分类与覆盖范围](#2-模板分类与覆盖范围)
3. [模板变量系统](#3-模板变量系统)
4. [模板渲染引擎](#4-模板渲染引擎)
5. [模板版本管理](#5-模板版本管理)
6. [模板导入导出](#6-模板导入导出)
7. [8 类模板完整字段规格](#7-8-类模板完整字段规格)
8. [预置模板清单](#8-预置模板清单)
9. [API 接口规格](#9-api-接口规格)
10. [前端组件 Props](#10-前端组件-props)
11. [运营配置项](#11-运营配置项)
12. [边界条件](#12-边界条件)
13. [验收标准](#13-验收标准)
14. [交叉引用](#14-交叉引用)

---

## 1. 数据表结构

### 1.1 `templates` — 模板定义

```typescript
export const templates = pgTable("templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: varchar("description", { length: 512 }),
  category: varchar("category", { length: 24 }).notNull(),
  // campaign | notification | email | announcement | banner | popup | coupon | report
  subCategory: varchar("sub_category", { length: 32 }),
  type: varchar("type", { length: 16 }).notNull(),               // system | custom
  version: integer("version").notNull().default(1),

  // 封面/缩略图
  thumbnailUrl: varchar("thumbnail_url", { length: 1024 }),
  coverUrl: varchar("cover_url", { length: 1024 }),

  // 模板内容（JSON 结构，按分类定义不同 schema）
  content: jsonb("content").notNull(),

  // 变量元信息
  variables: jsonb("variables").$type<TemplateVariableDef[]>().default([]),

  // 标签
  tags: varchar("tags", { length: 256 }).array(),

  // 使用统计
  useCount: integer("use_count").notNull().default(0),
  favoriteCount: integer("favorite_count").notNull().default(0),

  // 关联
  targetPage: varchar("target_page", { length: 256 }),           // 使用模板后跳转的目标页面
  targetApi: varchar("target_api", { length: 256 }),             // 使用模板后调用的API

  // 来源
  sourceTemplateId: integer("source_template_id"),                // 如果是自定义模板，指向系统模板ID
  createdBy: integer("created_by").references(() => users.id),
  status: varchar("status", { length: 12 }).notNull().default("active"), // draft | active | deprecated
  isFavorite: boolean("is_favorite").default(false),              // 用户维度的收藏（基于 user_template_favorites）

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  templatesCategoryIdx: index("templates_category_idx").on(table.category),
  templatesStatusIdx: index("templates_status_idx").on(table.status),
  templatesTypeIdx: index("templates_type_idx").on(table.type),
}));
```

### 1.2 `template_versions` — 模板版本历史

```typescript
export const templateVersions = pgTable("template_versions", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => templates.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  content: jsonb("content").notNull(),
  variables: jsonb("variables").$type<TemplateVariableDef[]>().default([]),
  changeLog: varchar("change_log", { length: 512 }),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  templateVersionsUniqueIdx: uniqueIndex("uk_template_version").on(table.templateId, table.version),
}));
```

### 1.3 `user_template_favorites` — 用户收藏

```typescript
export const userTemplateFavorites = pgTable("user_template_favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  templateId: integer("template_id").notNull().references(() => templates.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userTemplateFavoritesUnique: uniqueIndex("uk_user_template_fav").on(table.userId, table.templateId),
}));
```

### 1.4 `template_usage_logs` — 模板使用日志

```typescript
export const templateUsageLogs = pgTable("template_usage_logs", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => templates.id),
  userId: integer("user_id").notNull().references(() => users.id),
  action: varchar("action", { length: 16 }).notNull(),           // preview | apply | clone
  targetEntityId: integer("target_entity_id"),                   // 使用后创建的实体ID（如活动ID）
  targetEntityType: varchar("target_entity_type", { length: 32 }), // campaign | notification | ...
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

---

## 2. 模板分类与覆盖范围

### 2.1 分类总览

| # | 分类 | 代码 | 覆盖功能 | 目标页面 | 预置数量 |
|---|------|------|---------|---------|---------|
| 1 | 营销活动 | campaign | 活动创建 | `/admin/campaigns/create` | 6 |
| 2 | 通知消息 | notification | 站内信/推送 | `/admin/notifications/create` | 5 |
| 3 | 邮件 | email | 邮件模板 | `/admin/email-templates/create` | 5 |
| 4 | 全站公告 | announcement | 公告内容 | `/admin/announcements/create` | 3 |
| 5 | Banner | banner | 资源位素材 | `/admin/marketing/placements` | 4 |
| 6 | 弹窗 | popup | 弹窗物料 | `/admin/marketing/placements` | 3 |
| 7 | 兑换码 | coupon | 兑换码批次 | `/admin/coupons/create` | 3 |
| 8 | 报表 | report | 报表调度 | `/admin/reports/schedule` | 4 |

### 2.2 模板生命周期

```
system 模板（系统预置，不可编辑删除）
  │
  ├─ clone → custom 模板（可编辑、可删除）
  │
  ├─ apply → 目标功能页预填表单 → 保存为独立实体
  │
  └─ save-as-template → 从已有实体反向创建模板（custom 类型）
```

---

## 3. 模板变量系统

### 3.1 变量定义

```typescript
interface TemplateVariableDef {
  key: string;                     // 变量名，如 "user.nickname"
  label: string;                   // 显示名称，如 "用户昵称"
  type: "string" | "number" | "date" | "boolean" | "select" | "image";
  defaultValue?: any;
  options?: { label: string; value: any }[];  // select 类型时有效
  required?: boolean;
  placeholder?: string;
  hint?: string;                   // 提示文案
  validation?: string;             // 正则验证
  example?: string;                // 示例值
}
```

### 3.2 变量命名空间

| 命名空间 | 变量 | 类型 | 说明 |
|---------|------|------|------|
| `user.nickname` | 用户昵称 | string | 当前用户 |
| `user.balance` | 账户余额 | number | 分位显示 |
| `user.level` | 用户等级 | number | 1-∞ |
| `user.levelName` | 等级名称 | string | 如"黄金会员" |
| `user.monthlySpend` | 本月消费 | number | — |
| `user.registeredDays` | 注册天数 | number | — |
| `activity.campaignName` | 活动名称 | string | 创建时填入 |
| `activity.startDate` | 开始日期 | date | — |
| `activity.endDate` | 结束日期 | date | — |
| `activity.discountRate` | 折扣率 | number | 0-100 |
| `activity.budgetAmount` | 预算金额 | number | — |
| `platform.name` | 平台名称 | string | 系统配置 |
| `platform.url` | 平台地址 | string | 系统配置 |
| `platform.supportEmail` | 支持邮箱 | string | 系统配置 |
| `platform.logoUrl` | 平台Logo | image | 系统配置 |
| `date.now` | 当前日期 | date | 渲染时 |
| `date.nextMonth` | 下月同日 | date | — |
| `date.weekDay` | 星期几 | string | 如"周一" |
| `date.format(param)` | 格式化日期 | string | 如 `{{date.format("yyyy-MM-dd", activity.startDate)}}` |

### 3.3 变量占位符语法

```
基础变量:      {{user.nickname}}
嵌套变量:      {{activity.startDate}}
条件显示:      {{if user.level >= 3}} 尊享用户 {{end}}
循环:          {{each delivery.items}} {{item.name}} {{end}}
日期格式化:    {{date.format("yyyy-MM-dd HH:mm", activity.startDate)}}
默认值:        {{user.nickname || "用户"}}
```

### 3.4 变量解析

```
解析时机：
  └─ 应用模板时（preview / apply API）：后端解析
  └─ 运行时渲染（邮件发送、通知推送）：最终渲染时解析

解析规则：
  └─ 模板中定义的变量 → 替换为用户输入值
  └─ 未定义的变量 → 保留原样或替换为空白
  └─ 系统变量（platform.*）→ 自动从 site_configs 读取
  └─ 用户变量（user.*）→ 从当前用户上下文读取
  └─ 活动变量（activity.*）→ 从用户填写的表单数据读取
```

---

## 4. 模板渲染引擎

### 4.1 引擎架构

```
用户请求 apply 模板
    │
    ├─ POST /api/v1/admin/templates/:id/apply
    │
    ├─ TemplateEngine.resolve(templateId, context)
    │   ├─ Step 1: 加载模板 content
    │   ├─ Step 2: 加载变量定义
    │   ├─ Step 3: 解析系统变量（platform.*）
    │   ├─ Step 4: 解析用户变量（user.*）— 如果 context 中有 userId
    │   ├─ Step 5: 替换占位符
    │   ├─ Step 6: 生成预填数据
    │   └─ Step 7: 返回 targetPage + prefillData
    │
    └─ 前端跳转目标页面，表单自动填充
```

### 4.2 渲染输出

```typescript
interface TemplateApplyResult {
  templateId: number;
  templateName: string;
  targetPage: string;              // 跳转目标页面路径
  prefillData: Record<string, any>; // 预填数据
  resolvedVariables: {
    key: string;
    label: string;
    value: any;
    source: "user_input" | "system" | "user_context";
  }[];
  warnings?: string[];             // 如变量未定义等
}
```

### 4.3 运行时渲染

用于邮件发送、通知推送等场景的最终渲染：

```typescript
interface TemplateRenderContext {
  userId?: number;
  variables: Record<string, any>;   // 运行时变量
  locale?: string;                  // 语言
}

// 渲染引擎输出
interface TemplateRenderResult {
  subject?: string;                  // 邮件主题/通知标题
  body: string;                      // 渲染后的正文
  html?: string;                     // 邮件HTML
  resolvedVariables: Record<string, string>; // 已解析的变量映射
}
```

---

## 5. 模板版本管理

### 5.1 版本控制

```
系统模板：由开发/运营统一维护，version 递增
  └─ 每次编辑系统模板 → 新版本（version+1）
  └─ 旧版本保留在 template_versions 表中
  └─ 自定义模板可选择同步系统模板的最新版本

自定义模板：由运营人员自行维护
  └─ 更新时 version+1
  └─ 支持回滚到历史版本
```

### 5.2 版本操作

| 操作 | 说明 | 权限 |
|------|------|------|
| 查看历史版本 | 列出模板所有版本 | MARKETING_VIEW |
| 查看版本详情 | 查看某版本的内容 | MARKETING_VIEW |
| 回滚 | 将当前模板回滚到指定版本 | MARKETING_EDIT |
| 对比 | 对比两个版本的差异 | MARKETING_VIEW |

### 5.3 版本对比

```typescript
interface TemplateVersionDiff {
  versionA: number;
  versionB: number;
  changes: {
    path: string;              // 如 "content.rules"
    type: "added" | "removed" | "modified";
    before?: any;
    after?: any;
  }[];
}
```

---

## 6. 模板导入导出

### 6.1 导出格式

```json
{
  "schemaVersion": "1.0",
  "template": {
    "name": "新用户首充活动",
    "description": "注册7天内首充满¥100送¥20",
    "category": "campaign",
    "subCategory": "recharge_promotion",
    "version": 1,
    "content": { ... },
    "variables": [ ... ],
    "tags": ["新用户", "首充", "拉新"],
    "targetPage": "/admin/campaigns/create",
    "exportedAt": "2026-07-28T00:00:00Z",
    "exportedBy": "admin"
  }
}
```

### 6.2 导入格式

同导出格式，支持：
- 单文件导入（单个模板）
- 批量导入（JSON 数组 + 分类映射）
- 导入时自动检测同名模板（跳过或覆盖）

### 6.3 导入校验

```
导入时校验：
  └─ schemaVersion 匹配
  └─ category 在有效分类中
  └─ content 字段符合对应分类的 schema
  └─ 变量定义格式正确
  └─ 必填字段完整
  
校验失败 → 返回错误列表，逐条说明
```

---

## 7. 8 类模板完整字段规格

### 7.1 营销活动模板 (campaign)

```typescript
interface CampaignTemplateContent {
  // 基本信息
  name: string;                              // 活动名称
  type: "recharge_promotion" | "discount" | "invite" | "return" | "agent_incentive" | "model_promotion";
  description: string;

  // 时间规则
  timeType: "fixed" | "duration" | "permanent";
  startDate?: string;                        // 固定开始时间
  endDate?: string;                          // 固定结束时间
  durationDays?: number;                     // 持续天数（timeType=duration）

  // 目标用户
  targetUserType: "all" | "new_user" | "return_user" | "segment" | "level";
  targetSegmentId?: number;
  minUserLevel?: number;
  maxUserLevel?: number;

  // 预算
  budgetAmount: number;                      // 总预算(分)
  budgetPerUser?: number;                    // 单人预算上限(分)
  userLimit?: number;                        // 参与人数上限

  // 规则
  rules: CampaignRule[];

  // 通知
  notifyOnStart: boolean;                    // 活动开始时通知用户
  notifyTemplateId?: number;                 // 通知模板ID

  // 兑换码（如果涉及）
  couponConfig?: {
    prefix: string;
    count: number;
    faceValue: number;
    expireDays: number;
    minConsumeAmount?: number;               // 最低消费金额
  };
}

interface CampaignRule {
  type: "full_reduction" | "recharge_gift" | "discount_rate" | "invite_reward";
  condition: string;                         // 条件描述
  reward: string;                            // 奖励描述
  params: Record<string, any>;               // 参数
}
```

### 7.2 通知消息模板 (notification)

```typescript
interface NotificationTemplateContent {
  title: string;                             // 通知标题（支持变量）
  body: string;                              // 通知正文（支持变量）
  bodyTemplate: "text" | "html";
  icon?: string;                             // 通知图标
  actionUrl?: string;                        // 点击跳转（支持变量）
  actionLabel?: string;                      // 按钮文字
  category: "balance" | "key" | "system" | "activity" | "security";
  priority: "low" | "normal" | "high" | "urgent";
  // 变量定义
  variables: TemplateVariableDef[];
}
```

### 7.3 邮件模板 (email)

```typescript
interface EmailTemplateContent {
  subject: string;                           // 邮件主题（支持变量）
  preheader: string;                         // 预览文本（邮件列表中的摘要）
  htmlBody: string;                          // HTML 正文（支持变量 + 条件渲染）
  textBody: string;                          // 纯文本正文（降级使用）
  headerImageUrl?: string;                   // 邮件头部图片
  footerText: string;                        // 页脚文字（默认含退订链接）
  // 样式
  primaryColor: string;                      // 主色
  backgroundColor: string;                   // 背景色
  fontFamily: string;                        // 字体
  // 变量
  variables: TemplateVariableDef[];
}
```

### 7.4 全站公告模板 (announcement)

```typescript
interface AnnouncementTemplateContent {
  title: string;                             // 公告标题
  content: string;                           // 公告正文（支持变量）
  contentType: "markdown" | "html" | "text";
  category: "system" | "activity" | "notice" | "emergency";
  priority: "low" | "normal" | "high" | "urgent";
  displayPosition: "top" | "sidebar" | "popup" | "center";
  closable: boolean;
  autoCloseSeconds?: number;                 // 自动关闭秒数
  confirmRequired: boolean;                  // 是否需要用户确认已读
  // 变量
  variables: TemplateVariableDef[];
}
```

### 7.5 Banner 模板 (banner)

```typescript
interface BannerTemplateContent {
  name: string;
  mediaType: "image" | "html" | "text";
  imageUrl?: string;                         // 示例图片URL
  imageMobileUrl?: string;
  imageAlt: string;
  textContent?: string;
  linkUrl?: string;                          // 示例跳转链接
  linkTarget: "_self" | "_blank";
  // 文案建议
  copySuggestions: {
    primary: string;                         // 主文案
    secondary?: string;                      // 副文案
    cta: string;                             // CTA 按钮文字
  };
  // 配色方案
  colorScheme: {
    primary: string;
    secondary: string;
    textColor: string;
    backgroundColor: string;
  };
  // 尺寸提示
  dimensionHint: string;                     // "推荐尺寸：1920×200px"
  variables: TemplateVariableDef[];
}
```

### 7.6 弹窗模板 (popup)

```typescript
interface PopupTemplateContent {
  name: string;
  mediaType: "image" | "html" | "text";
  imageUrl?: string;
  htmlContent?: string;
  textContent?: string;
  linkUrl?: string;
  width: number;
  height: number;
  popupDelayMs: number;
  popupClosable: boolean;
  popupOverlay: boolean;
  popupOverlayClose: boolean;
  popupFrequency: "once" | "daily" | "weekly" | "always";
  // 文案建议
  copySuggestions: {
    primary: string;
    secondary?: string;
    cta: string;
  };
  colorScheme: {
    primary: string;
    backgroundColor: string;
    textColor: string;
    buttonColor: string;
  };
  variables: TemplateVariableDef[];
}
```

### 7.7 兑换码模板 (coupon)

```typescript
interface CouponTemplateContent {
  name: string;
  prefix: string;                            // 兑换码前缀
  count: number;                             // 生成数量
  faceValue: number;                         // 面额(分)
  faceValueType: "fixed" | "percentage" | "trial_day";
  maxDiscount?: number;                      // 最大折扣金额(分)
  minConsumeAmount?: number;                 // 最低消费(分)
  expireDays: number;                        // 有效期天数
  expireType: "fixed" | "relative";          // fixed: 固定日期, relative: 领取后N天
  fixedExpireDate?: string;
  applicableModels: "all" | "specific" | "exclude";
  applicableModelIds?: number[];
  excludeModelIds?: number[];
  userLimit: number;                         // 每人限领
  totalLimit: number;                        // 总领取上限
  variables: TemplateVariableDef[];
}
```

### 7.8 报表模板 (report)

```typescript
interface ReportTemplateContent {
  name: string;
  reportType: "consumption" | "revenue" | "active_users" | "vendor_cost" | "custom";
  metrics: string[];                         // 指标列表
  groupBy: "day" | "week" | "month" | "quarter";
  timeRange: "last_7d" | "last_30d" | "last_month" | "custom";
  chartType: "line" | "bar" | "pie" | "table" | "mixed";
  recipients: string[];                      // 收件人邮箱（默认）
  schedule: "none" | "daily" | "weekly" | "monthly";
  scheduleDay?: number;                      // 每周几/每月几号
  scheduleTime: string;                      // "09:00"
  format: "pdf" | "csv" | "email_html";
  variables: TemplateVariableDef[];
}
```

---

## 8. 预置模板清单

### 8.1 营销活动 (6 个)

| 模板名 | subCategory | 目标用户 | 预算(元) | 规则简述 |
|--------|------------|---------|---------|---------|
| 新用户首充 | recharge_promotion | new_user | 不限 | 首充满 ¥100 送 ¥20 |
| 节假日促销 | discount | all | 50000 | 指定模型 8 折 |
| 邀请有礼 | invite | all | 10000 | 双向奖励 ¥10 |
| 老用户回归 | return | return_user | 20000 | 首充双倍赠送 |
| 代理商激励 | agent_incentive | segment | 50000 | 月流水 3% 返佣 |
| 模型推广 | model_promotion | all | 30000 | 新模型 5 折 7 天 |

### 8.2 通知消息 (5 个)

| 模板名 | 分类 | 变量 |
|--------|------|------|
| 余额不足提醒 | balance | `{{user.balance}}`, `{{user.nickname}}` |
| Key 即将过期 | key | `{{key.name}}`, `{{key.expireDays}}` |
| 充值到账 | balance | `{{recharge.amount}}`, `{{user.balance}}` |
| 活动通知 | activity | `{{activity.campaignName}}`, `{{activity.endDate}}` |
| 系统维护通知 | system | `{{maintenance.startTime}}`, `{{maintenance.expectedDuration}}` |

### 8.3 邮件 (5 个)

| 模板名 | 用途 | 关键变量 |
|--------|------|---------|
| 欢迎邮件 | 注册引导 | `{{user.nickname}}`, `{{platform.name}}` |
| 月度报告 | 消费报告 | `{{user.nickname}}`, `{{user.monthlySpend}}` |
| 发票通知 | 发票开具 | `{{invoice.number}}`, `{{invoice.amount}}` |
| 退款处理 | 退款状态 | `{{refund.amount}}`, `{{refund.status}}` |
| 安全提醒 | 安全通知 | `{{security.eventType}}`, `{{security.loginTime}}` |

### 8.4 公告 (3 个)

| 模板名 | 优先级 | 位置 |
|--------|--------|------|
| 系统升级通知 | normal | top |
| 节日祝福 | low | sidebar |
| 紧急安全通知 | urgent | popup |

### 8.5 Banner (4 个)

| 模板名 | 尺寸 | 示例文案 |
|--------|------|---------|
| 通用促销 Banner | 1920×200 | "限时优惠，全场 8 折" |
| 新模型上线 | 1920×200 | "全新模型 X 已上线，立即体验" |
| 充值优惠 | 1920×200 | "充得多送得多，最高送 ¥500" |
| 节日 Banner | 1920×200 | "中秋快乐，充值有礼" |

### 8.6 弹窗 (3 个)

| 模板名 | 尺寸 | 频次 | 延迟 |
|--------|------|------|------|
| 新用户首充弹窗 | 480×360 | once | 3000ms |
| 活动弹窗 | 480×360 | weekly | 5000ms |
| 问卷调查弹窗 | 400×320 | once | 8000ms |

### 8.7 兑换码 (3 个)

| 模板名 | 面额 | 有效期 | 数量 |
|--------|------|--------|------|
| 新用户注册礼 | ¥10 | 30天 | 1000 |
| 充值返现券 | ¥20 | 15天 | 500 |
| 体验券 | 7天 | 30天 | 200 |

### 8.8 报表 (4 个)

| 模板名 | 指标 | 周期 | 收件人 |
|--------|------|------|--------|
| 日营收报告 | 营收/成本/毛利 | 每日 | finance@ |
| 周活跃报告 | DAU/新增/留存 | 每周 | ops@ |
| 月度运营报告 | 全指标 | 每月 | all |
| 供应商成本报告 | 供应商成本/比例 | 每月 | finance@ |

---

## 9. API 接口规格

### 9.1 模板管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/templates` | 模板列表 | MARKETING_VIEW |
| GET | `/api/v1/admin/templates/:id` | 模板详情 | MARKETING_VIEW |
| POST | `/api/v1/admin/templates` | 创建自定义模板 | MARKETING_EDIT |
| PATCH | `/api/v1/admin/templates/:id` | 编辑模板 | MARKETING_EDIT |
| DELETE | `/api/v1/admin/templates/:id` | 删除模板（仅 custom） | MARKETING_EDIT |
| POST | `/api/v1/admin/templates/:id/clone` | 复制模板 | MARKETING_EDIT |
| POST | `/api/v1/admin/templates/:id/apply` | 应用模板 | MARKETING_EDIT |
| POST | `/api/v1/admin/templates/:id/favorite` | 收藏/取消收藏 | MARKETING_EDIT |
| POST | `/api/v1/admin/templates/:id/deprecate` | 标记为废弃 | MARKETING_EDIT |

**GET 列表参数**：

```typescript
interface QueryTemplates {
  category?: string;
  subCategory?: string;
  type?: "system" | "custom";
  search?: string;
  tags?: string[];
  sortBy?: "useCount" | "createdAt" | "name";
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}
```

### 9.2 模板版本

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/templates/:id/versions` | 版本列表 | MARKETING_VIEW |
| GET | `/api/v1/admin/templates/:id/versions/:version` | 版本详情 | MARKETING_VIEW |
| POST | `/api/v1/admin/templates/:id/versions/:version/restore` | 回滚到指定版本 | MARKETING_EDIT |
| GET | `/api/v1/admin/templates/:id/versions/diff?v1=X&v2=Y` | 版本对比 | MARKETING_VIEW |

### 9.3 模板导入导出

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/templates/:id/export` | 导出单个模板 | MARKETING_VIEW |
| POST | `/api/v1/admin/templates/import` | 导入模板 | MARKETING_EDIT |
| GET | `/api/v1/admin/templates/export-batch?ids=1,2,3` | 批量导出 | MARKETING_VIEW |
| POST | `/api/v1/admin/templates/import-batch` | 批量导入 | MARKETING_EDIT |

### 9.4 模板使用

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/v1/admin/templates/:id/apply` | 应用模板（返回预填数据） | MARKETING_EDIT |
| POST | `/api/v1/admin/templates/:id/render` | 运行时渲染（最终渲染） | MARKETING_EDIT |
| POST | `/api/v1/admin/templates/save-as-template` | 从实体保存为模板 | MARKETING_EDIT |

**apply 响应**：

```typescript
interface TemplateApplyResponse {
  targetPage: string;
  prefillData: Record<string, any>;
  resolvedVariables: {
    key: string;
    label: string;
    value: any;
    source: "user_input" | "system" | "user_context";
  }[];
  warnings?: string[];
}
```

**render 请求体**：

```typescript
interface TemplateRenderRequest {
  context: {
    userId?: number;
    variables: Record<string, any>;
    locale?: string;
  };
}
```

---

## 10. 前端组件 Props

### 10.1 TemplateLibrary — 模板库页面

```typescript
interface TemplateLibraryProps {
  // 路由页面，无外部 props
}

// 内部子组件
interface TemplateCategoryTreeProps {
  categories: { key: string; label: string; icon: string; count: number }[];
  activeCategory: string;
  onSelect: (category: string) => void;
}

interface TemplateCardGridProps {
  items: TemplateCardItem[];
  loading: boolean;
  onPreview: (id: number) => void;
  onApply: (id: number) => void;
  onClone: (id: number) => void;
  onFavorite: (id: number, isFavorite: boolean) => void;
}

interface TemplateCardItem {
  id: number;
  name: string;
  description: string;
  category: string;
  type: string;
  thumbnailUrl?: string;
  tags: string[];
  useCount: number;
  isFavorite: boolean;
  version: number;
  updatedAt: string;
}
```

### 10.2 TemplatePreview — 模板预览

```typescript
interface TemplatePreviewProps {
  templateId: number;
  onClose: () => void;
  onApply: () => void;
}

interface TemplatePreviewPanelProps {
  category: string;
  content: Record<string, any>;
  variables: TemplateVariableDef[];
  resolvedVariables: Record<string, any>;
  onVariableChange: (key: string, value: any) => void;
}
```

### 10.3 TemplateEditor — 模板编辑

```typescript
interface TemplateEditorProps {
  mode: "create" | "edit";
  templateId?: number;
  initialData?: Partial<TemplateFormData>;
  onSave: (data: TemplateFormData) => Promise<void>;
  onCancel: () => void;
}

interface TemplateFormData {
  name: string;
  description: string;
  category: string;
  subCategory?: string;
  content: Record<string, any>;
  variables: TemplateVariableDef[];
  tags: string[];
  thumbnailUrl?: string;
  targetPage: string;
  status: "draft" | "active";
}
```

### 10.4 TemplateVersionHistory — 版本历史

```typescript
interface TemplateVersionHistoryProps {
  templateId: number;
  versions: {
    version: number;
    changeLog: string;
    createdByName: string;
    createdAt: string;
  }[];
  onRestore: (version: number) => void;
  onDiff: (v1: number, v2: number) => void;
}

interface TemplateVersionDiffViewProps {
  versionA: number;
  versionB: number;
  changes: TemplateVersionDiff[];
}
```

### 10.5 TemplateImportExport — 导入导出

```typescript
interface TemplateImportExportProps {
  onImport: (file: File) => Promise<void>;
  onExport: (templateIds: number[]) => Promise<void>;
}

interface TemplateImportPreviewProps {
  importedData: any;
  validationErrors?: string[];
  onConfirm: () => void;
  onCancel: () => void;
}
```

---

## 11. 运营配置项

| 配置项 | 路径 | 类型 | 默认值 | 说明 |
|-------|------|------|--------|------|
| 模板库启用 | `site_configs.template_library.enabled` | boolean | true | 全局开关 |
| 自定义模板上限 | `site_configs.template_library.max_custom_templates` | int | 200 | 每用户自定义模板数量上限 |
| 系统模板同步 | `site_configs.template_library.auto_sync_system` | boolean | true | 系统模板更新时自动通知自定义模板 |
| 邮件模板默认页脚 | `site_configs.template_library.email_footer` | string | "© 2026 3cloud" | 邮件模板默认页脚 |
| 平台名称 | `site_configs.platform.name` | string | "3cloud" | 用于 `{{platform.name}}` 变量 |
| 平台地址 | `site_configs.platform.url` | string | "https://unmisa.com" | 用于 `{{platform.url}}` 变量 |
| 支持邮箱 | `site_configs.platform.support_email` | string | "support@3cloud.ai" | 用于 `{{platform.supportEmail}}` 变量 |

---

## 12. 边界条件

### 12.1 数据边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B1 | 自定义模板超过上限 | 创建时提示"已达上限，请先删除其他模板" |
| B2 | 系统模板被删除 | 不可删除，API 返回 403 |
| B3 | 模板 content 字段不符合 schema | 创建/编辑时做 JSON Schema 校验 |

### 12.2 使用边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B4 | 应用模板时目标功能已变更 | 返回预填数据时做兼容处理，不兼容字段标记为"需手动填写" |
| B5 | 模板变量中的用户上下文不存在 | 变量保留原样，返回 warning |
| B6 | 模板被 deprecated 但仍有使用 | 允许查看历史，不可应用 |
| B7 | 从实体保存为模板时字段缺失 | 必填字段缺失则不可保存，提示补全 |

### 12.3 版本边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B8 | 回滚到非常旧的版本 | 兼容性检查，targetPage 可能已变更，提示"目标页面可能已变更" |
| B9 | 版本对比时内容差异过大 | 截断对比结果，只展示前 20 条差异 |
| B10 | 并发编辑同一模板 | 乐观锁（updatedAt），后保存者提示冲突 |

### 12.4 导入导出边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B11 | 导入的模板分类不存在 | 尝试映射到最接近的分类，或拒绝导入 |
| B12 | 导入的 content 字段缺失 | 校验失败，返回具体错误字段列表 |
| B13 | 导入文件格式错误 | 捕获 JSON 解析错误，提示"文件格式不正确" |
| B14 | 导入的模板名称与现有重复 | 自动追加" (1)"后缀 |

---

## 13. 验收标准

### 13.1 模板管理

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC1 | 模板列表 | 按分类展示，搜索/标签筛选正常 |
| AC2 | 创建自定义模板 | 8 种分类均支持创建，必填校验通过 |
| AC3 | 编辑系统模板 | 系统模板不可编辑（按钮灰化）|
| AC4 | 收藏功能 | 收藏后模板置顶，取消收藏恢复 |
| AC5 | 复制模板 | 复制为自定义模板，内容一致 |

### 13.2 模板应用

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC6 | 应用模板 | 跳转目标页面，表单预填正确 |
| AC7 | 变量替换 | 系统变量/用户变量/活动变量正确替换 |
| AC8 | 条件渲染 | `{{if}}` 条件显示正常 |
| AC9 | 未定义变量 | 保留原样或替换为空，给出 warning |

### 13.3 版本管理

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC10 | 版本历史 | 每次编辑产生新版本，历史可查 |
| AC11 | 回滚 | 回滚到指定版本后内容正确 |
| AC12 | 版本对比 | 差异展示清晰，增加/修改/删除标记正确 |

### 13.4 导入导出

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC13 | 导出 | 单个和批量导出格式正确 |
| AC14 | 导入 | 正确格式导入成功，校验失败时提供错误列表 |
| AC15 | 同名检测 | 导入同名模板自动处理 |

---

## 14. 交叉引用

| 关联模块 | 文档 | 关系 |
|---------|------|------|
| 营销活动 | `ref-4.5-marketing.md` | 活动模板 → 活动创建页预填 |
| 通知规则 | `ref-4.14.5-notification-rules.md` | 通知模板 → 通知规则内容 |
| 资源位管理 | `ref-4.16-resource-placement.md` | Banner/弹窗模板 → 物料创建预填 |
| 报表推送 | `ref-4.14-report-push.md` | 报表模板 → 定时推送配置 |
| 邮件服务 | — | 邮件模板 → 邮件发送引擎 |
| 兑换码 | `ref-4.5-marketing.md` | 兑换码模板 → 兑换码批次创建 |
| 操作日志 | `ref-4.13-operation-timeline.md` | 模板使用操作写入日志 |