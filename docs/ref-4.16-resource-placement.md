# 运营资源位管理 — 深化参考文档

> **对应章节**：[PRD-README.md §4.5 营销运营](../PRD-README.md#45-营销与运营精化) — 深化模块
> **状态**：已深化完成 ✅ | **版本**：v2.0 | **最后更新**：2026-07-28
> **定位**：运营人员自助管理 Banner/弹窗/侧边栏横幅/悬浮按钮等资源位，支持定向展示、排期管理、AB 测试、数据统计。
> **设计原则**：与公告系统互补（公告→站内信通知，资源位→视觉曝光位）。复用用户分群引擎做定向。
> **粒度**：数据模型 → 渲染引擎 → 尺寸标准 → 排期引擎 → 定向规则 → 埋点 → API → 组件 → 配置 → 边界 → 验收

---

## 目录

1. [数据表结构](#1-数据表结构)
2. [资源位类型与尺寸标准](#2-资源位类型与尺寸标准)
3. [物料管理](#3-物料管理)
4. [渲染引擎](#4-渲染引擎)
5. [排期引擎](#5-排期引擎)
6. [定向展示规则](#6-定向展示规则)
7. [AB 测试集成](#7-ab-测试集成)
8. [埋点与统计分析](#8-埋点与统计分析)
9. [API 接口规格](#9-api-接口规格)
10. [前端组件 Props](#10-前端组件-props)
11. [运营配置项](#11-运营配置项)
12. [边界条件](#12-边界条件)
13. [验收标准](#13-验收标准)
14. [交叉引用](#14-交叉引用)

---

## 1. 数据表结构

### 1.1 `placements` — 资源位定义

```typescript
export const placements = pgTable("placements", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  position: varchar("position", { length: 32 }).notNull(),       // 位置 key，如 "home_banner_top"
  type: varchar("type", { length: 16 }).notNull(),                // banner | popup | sidebar_banner | floating_button
  pagePath: varchar("page_path", { length: 256 }).default("/*"),  // 展示页面路径，"/*"=全站
  maxSlots: integer("max_slots").notNull().default(5),            // 该位置最多同时展示物料数
  sortStrategy: varchar("sort_strategy", { length: 16 }).default("priority"), // priority | random | manual
  renderStrategy: varchar("render_strategy", { length: 16 }).default("carousel"), // carousel | stack | single
  widthPc: integer("width_pc"),                                   // PC 端宽度(px)
  heightPc: integer("height_pc"),                                 // PC 端高度(px)
  widthMobile: integer("width_mobile"),                           // 移动端宽度(px)
  heightMobile: integer("height_mobile"),                         // 移动端高度(px)
  isEnabled: boolean("is_enabled").notNull().default(true),
  description: varchar("description", { length: 256 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 索引
placements_position_idx — on(position)
```

**预置资源位**：

| 位置 key | 名称 | 类型 | 页面 | 尺寸(PC) | 尺寸(Mobile) | 渲染策略 |
|---------|------|------|------|---------|-------------|---------|
| `home_banner_top` | 首页顶部横幅 | banner | /console | 全宽×200 | 全宽×120 | carousel |
| `home_popup` | 首页弹窗 | popup | /console | 480×360 | 320×280 | single |
| `sidebar_banner` | 侧边栏横幅 | sidebar_banner | /console,/admin | 侧栏宽×120 | 侧栏宽×80 | single |
| `model_center_banner` | 模型中心横幅 | banner | /console/models | 全宽×160 | 全宽×100 | single |
| `recharge_banner` | 充值页横幅 | banner | /console/recharge | 全宽×160 | 全宽×100 | single |
| `login_banner` | 登录页横幅 | banner | /login,/register | 全宽×180 | 全宽×120 | carousel |
| `floating_activity` | 悬浮活动按钮 | floating_button | /* | 60×60 | 48×48 | single |

### 1.2 `placement_items` — 物料

```typescript
export const placementItems = pgTable("placement_items", {
  id: serial("id").primaryKey(),
  placementId: integer("placement_id").notNull().references(() => placements.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 128 }).notNull(),

  // 素材内容 (media_type 决定哪个字段生效)
  mediaType: varchar("media_type", { length: 16 }).notNull(),     // image | html | text
  imageUrl: varchar("image_url", { length: 1024 }),               // PC 端图片URL
  imageMobileUrl: varchar("image_mobile_url", { length: 1024 }),  // 移动端图片URL（可选，降级使用 imageUrl）
  imageAlt: varchar("image_alt", { length: 256 }),                // 图片alt文字（SEO/无障碍）
  htmlContent: text("html_content"),                              // 自定义HTML
  textContent: varchar("text_content", { length: 512 }),          // 纯文本

  // 跳转行为
  linkUrl: varchar("link_url", { length: 1024 }),                  // 点击跳转URL
  linkTarget: varchar("link_target", { length: 8 }).default("_self"), // _self | _blank

  // 展示控制
  priority: integer("priority").notNull().default(0),             // 优先级，值越大越优先
  startAt: timestamp("start_at", { withTimezone: true }),         // 展示开始时间
  endAt: timestamp("end_at", { withTimezone: true }),             // 展示结束时间
  maxImpressions: integer("max_impressions"),                     // 最大曝光次数（全局）
  maxClicks: integer("max_clicks"),                               // 最大点击次数（全局）
  userFrequency: varchar("user_frequency", { length: 16 }).default("always"), // once | daily | weekly | always（单用户频次）
  showOnLogin: boolean("show_on_login").default(false),           // 登录后才展示（非登录页资源位）

  // 定向规则
  targetType: varchar("target_type", { length: 16 }).default("all"), // all | segment | tags | conditions
  segmentIds: jsonb("segment_ids").$type<number[]>(),
  tagIds: jsonb("tag_ids").$type<number[]>(),
  targetConditions: jsonb("target_conditions").$type<FilterGroup>(),

  // AB 测试
  abTestId: integer("ab_test_id"),
  abTestVariant: varchar("ab_test_variant", { length: 8 }),       // control | variant_a | variant_b

  // 弹窗特有属性
  popupWidth: integer("popup_width"),                             // 弹窗宽度(px)，覆盖 placement 默认
  popupHeight: integer("popup_height"),                           // 弹窗高度(px)
  popupDelayMs: integer("popup_delay_ms").default(0),             // 延迟弹出(毫秒)
  popupClosable: boolean("popup_closable").default(true),         // 是否可关闭
  popupOverlay: boolean("popup_overlay").default(true),           // 是否有遮罩层
  popupOverlayClose: boolean("popup_overlay_close").default(true), // 点击遮罩关闭

  // 悬浮按钮特有属性
  floatingIcon: varchar("floating_icon", { length: 256 }),        // 图标URL（不传则用文字）
  floatingText: varchar("floating_text", { length: 16 }),         // 按钮文字（如"活动"）
  floatingBadge: varchar("floating_badge", { length: 8 }),        // 角标文字（如"New"、"Hot"）

  // 统计（读写分离：写入 placement_events，此处缓存计数用于列表展示）
  impressionCount: integer("impression_count").notNull().default(0),
  clickCount: integer("click_count").notNull().default(0),
  dismissCount: integer("dismiss_count").notNull().default(0),

  status: varchar("status", { length: 16 }).notNull().default("draft"),
  // draft → active(自动/手动) → paused → ended → archived
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  placementItemsPlacementIdx: index("placement_items_placement_idx").on(table.placementId),
  placementItemsStatusIdx: index("placement_items_status_idx").on(table.status),
  placementItemsTimeIdx: index("placement_items_time_idx").on(table.startAt, table.endAt),
}));
```

### 1.3 `placement_events` — 事件日志

```typescript
export const placementEvents = pgTable("placement_events", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => placementItems.id, { onDelete: "cascade" }),
  placementId: integer("placement_id").notNull(),                 // 冗余，方便查询
  userId: integer("user_id"),                                     // 匿名用户可为 null
  sessionId: varchar("session_id", { length: 64 }),               // 会话ID（匿名用户追踪）
  event: varchar("event", { length: 16 }).notNull(),              // impression | click | dismiss | close
  pageUrl: varchar("page_url", { length: 512 }),                  // 事件发生时页面URL
  pageTitle: varchar("page_title", { length: 256 }),              // 页面title
  userAgent: text("user_agent"),
  ip: varchar("ip", { length: 45 }),
  referrer: varchar("referrer", { length: 1024 }),
  deviceType: varchar("device_type", { length: 16 }),             // pc | mobile | tablet
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  placementEventsItemIdx: index("placement_events_item_idx").on(table.itemId, table.createdAt),
  placementEventsTimeIdx: index("placement_events_time_idx").on(table.createdAt),
}));
```

### 1.4 `placement_item_schedule_rules` — 排期规则（扩展）

用于复杂排期场景（定时上/下线、节假日特殊排期、A/B 时段）。

```typescript
export const placementItemScheduleRules = pgTable("placement_item_schedule_rules", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => placementItems.id, { onDelete: "cascade" }),
  ruleType: varchar("rule_type", { length: 20 }).notNull(),       // time_range | weekly | holiday_exception
  // time_range: 固定时间段
  startAt: timestamp("start_at", { withTimezone: true }),
  endAt: timestamp("end_at", { withTimezone: true }),
  // weekly: 每周几几点
  dayOfWeek: integer("day_of_week"),                              // 0=周日, 1-6=周一到周六
  timeStart: varchar("time_start", { length: 5 }),                // "09:00"
  timeEnd: varchar("time_end", { length: 5 }),                    // "18:00"
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

---

## 2. 资源位类型与尺寸标准

### 2.1 Banner 横幅

| 属性 | PC 端 | 移动端 |
|------|-------|--------|
| 展示区域 | 页面顶部全宽（导航栏下方） | 页面顶部全宽 |
| 尺寸 | 全宽 × 180-200px | 全宽 × 100-120px |
| 渲染策略 | 多物料时 carousel 轮播（5s/张） | 同 PC |
| 轮播指示器 | 底部居中圆点 | 底部居中圆点 |
| 关闭按钮 | 右上角 ×（关闭后当前会话隐藏） | 右上角 × |
| 图片格式 | JPG/PNG/WebP | JPG/PNG/WebP |
| 最大文件 | 2MB | 1MB |

**素材要求**：
- PC 端：1920×200px 或按实际宽度等比缩放，中心裁剪
- 移动端：750×120px 或按实际宽度等比缩放
- 文字内容叠加在图片上，不单独渲染文本

### 2.2 Popup 弹窗

| 属性 | PC 端 | 移动端 |
|------|-------|--------|
| 展示方式 | 居中的模态弹窗 + 遮罩层 | 底部弹出或居中 |
| 默认尺寸 | 480×360px（可配 400×300 ~ 800×600） | 320×280px（可配）|
| 关闭按钮 | 右上角 × | 右上角 × |
| 遮罩层 | 半透明黑色（60%），可配置 | 同 PC |
| 点击遮罩关闭 | 可配置（默认打开） | 同 PC |
| 频次控制 | 必配：once/daily/weekly/always | 同 PC |
| 延迟弹出 | 0-15s，以 100ms 为步进 | 同 PC |
| 动画 | fadeIn + scale（300ms） | 底部滑入（300ms）|

**素材要求**：
- 弹窗内容可以是图片（推荐 480×360）或自定义 HTML
- HTML 弹窗需要运营自行编写，系统仅提供容器

### 2.3 侧边栏横幅

| 属性 | PC 端 | 移动端 |
|------|-------|--------|
| 展示区域 | 侧边栏内部，导航菜单下方 | 底部导航与页面内容之间 |
| 尺寸 | 侧栏宽 × 120px | 全宽 × 80px |
| 关闭按钮 | 有（右上角 ×） | 有 |
| 渲染策略 | 单选，最高优先级物料 | 同 PC |

### 2.4 悬浮按钮

| 属性 | PC 端 | 移动端 |
|------|-------|--------|
| 位置 | 页面右下角，固定定位 | 页面右下角，固定定位 |
| 尺寸 | 60×60px | 48×48px |
| 间距 | bottom: 100px, right: 24px | bottom: 80px, right: 16px |
| 角标 | 右上角"New"/"Hot"红色角标 | 同 PC |
| 交互 | 点击跳转或展开菜单 | 同 PC |
| Z-index | 1000（高于聊天/客服浮窗） | 1000 |

### 2.5 素材上传规范

```
┌─────────────────────────────────────────┐
│ 素材上传对话框                          │
│                                         │
│ 资源位：首页顶部横幅                     │
│ 推荐尺寸：1920×200px                     │
│ 最大文件：2MB                           │
│ 格式：JPG / PNG / WebP                   │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │          [拖拽上传或点击选择]        │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ 移动端图片（可选）：                     │
│ ┌─────────────────────────────────────┐ │
│ │          [拖拽上传或点击选择]        │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ 图片替代文字：[ ................................ ] │
│                                         │
│ [取消]                    [保存]        │
└─────────────────────────────────────────┘
```

---

## 3. 物料管理

### 3.1 物料生命周期

```
draft ──→ active ──→ paused ──→ active ──→ ended ──→ archived
  ↑          │          │          │          │
  └──────────┘          └──────────┘          │
     编辑                  恢复               不可逆
```

### 3.2 创建物料完整流程

```
Step 1: 选择资源位位置
  └─ 下拉选择预置资源位（显示当前活跃物料数/最大槽位数）

Step 2: 填写基本信息
  └─ 物料名称（128字以内，必填）
  └─ 素材类型（image / html / text）
  └─ 上传素材（按位置推荐尺寸校验）
  └─ 跳转链接（可选）

Step 3: 配置展示规则
  └─ 优先级（0-100，默认 0，越高越优先）
  └─ 展示时间（可选时间段，不选则立即上线永不过期）
  └─ 全局曝光上限（可选，达到后自动暂停）
  └─ 全局点击上限（可选）
  └─ 单用户频次（always / once / daily / weekly）
  └─ 是否登录后展示

Step 4: 配置定向（可选，默认全平台）
  └─ 按用户分群（复用 ref-4.10 引擎）
  └─ 按标签
  └─ 按条件（用户等级 / 账户余额区间 / 注册时间等）

Step 5: 配置弹窗特有属性（素材类型=popup 时显示）
  └─ 弹窗宽高
  └─ 延迟时间
  └─ 是否可关闭 / 是否有遮罩 / 点击遮罩是否关闭
  └─ 频次控制（once/daily/weekly/always）

Step 6: 预览
  └─ PC/移动端双预览模式
  └─ 模拟不同定向条件下的展示效果

Step 7: 保存（draft）或发布（active）
```

### 3.3 物料列表页

**路径**：`/admin/marketing/placements`

```
┌─ 运营资源位管理 ───────────────────────────────────────┐
│                                                          │
│ ┌─ 资源位导航 ───────────────────────────────────────┐ │
│ │  📢 首页顶部横幅 (2/5)    📌 首页弹窗 (1/1)       │ │
│ │  📰 侧边栏横幅 (0/3)     🖼️ 登录页横幅 (2/5)     │ │
│ │  🔘 悬浮活动按钮 (1/1)                              │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─ 当前资源位: 首页顶部横幅 ──────── [+ 新增物料] ──┐   │
│ │                                                     │ │
│ │ 物料名称  │ 状态  │ 展示时间      │ 曝光/点击 │ CTR │ │
│ │ 夏季促销  │ active│ 7/1→7/31     │ 12K/856  │ 7.1% │ │
│ │ 新模型上线│ active│ 7/15→8/15    │ 8K/512   │ 6.4% │ │
│ │ 备用Banner│ draft │ —            │ —/—      │ —   │ │
│ │                                                     │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─ 排期时间线 ─────────────────────────────────────────┐ │
│ │  Jul 1        Jul 15       Aug 1        Aug 15       │ │
│ │  ┌────────────┐ ┌────────────┐                        │ │
│ │  │ 夏季促销    │ │ 新模型上线  │                        │ │
│ │  └────────────┘ └────────────┘                        │ │
│ │  [↔ 拖拽调整时间]                                      │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## 4. 渲染引擎

### 4.1 引擎架构

```
用户访问页面
    │
    ├─ 前端 PlacementRenderer 检测到资源位 DOM 容器
    │
    ├─ 请求 GET /api/v1/me/placements?position=home_banner_top
    │
    ├─ 后端 PlacementEngine.resolve()
    │   ├─ Step 1: 查询 placements 表中 position=home_banner_top 的定义
    │   │   └─ 获取 maxSlots / sortStrategy / renderStrategy
    │   │
    │   ├─ Step 2: 查询该位置下 status=active 的物料
    │   │   └─ FILTER: startAt <= now() AND (endAt IS NULL OR endAt > now())
    │   │   └─ FILTER: (maxImpressions IS NULL OR impressionCount < maxImpressions)
    │   │   └─ FILTER: (maxClicks IS NULL OR clickCount < maxClicks)
    │   │
    │   ├─ Step 3: 定向过滤
    │   │   └─ 对每个物料检查 targetType
    │   │   └─ segment → 用户是否在分群中
    │   │   └─ tags → 用户是否携带指定标签
    │   │   └─ conditions → 条件表达式求值
    │   │
    │   ├─ Step 4: 用户频次检查
    │   │   └─ 查询 placement_events (userId/sessionId, itemId)
    │   │   └─ 根据 userFrequency 判断是否展示：
    │   │      once: 已曝光过 → 不展示
    │   │      daily: 今天已曝光 → 不展示
    │   │      weekly: 本周已曝光 → 不展示
    │   │
    │   ├─ Step 5: 排序截断
    │   │   └─ 按 priority 降序排列
    │   │   └─ 取前 maxSlots 个
    │   │
    │   └─ Step 6: 组装响应
    │       └─ 返回物料数据（含素材URL/跳转/弹窗配置等）
    │
    ├─ 前端 PlacementRenderer 渲染（按 renderStrategy）
    │   ├─ carousel → 轮播组件
    │   ├─ stack → 堆叠展示（仅 sidebar_banner）
    │   └─ single → 单物料展示
    │
    └─ 前端自动上报 impression 事件
```

### 4.2 Selector 组合逻辑

同一用户 + 同一位置同时命中多个物料时的选择策略：

```
Step 1: 定向精确度排序
  └─ 按 targetType 计算精确度分数：
     all = 0
     tags = 1
     segment = 2
     conditions = 3
  └─ 分数越高的物料优先展示

Step 2: 同分时按 priority 排序
  └─ priority 值越大越优先

Step 3: 同分时按创建时间排序
  └─ 先创建的优先

Step 4: 按 maxSlots 截断
  └─ carousel 模式：所有选中物料参与轮播
  └─ single 模式：只展示第一条
```

### 4.3 兜底策略

```
无任何物料命中时：
  └─ 返回空数组 → 前端不渲染该资源位

已展示物料中途下架/结束时：
  └─ 下次请求时自动消失（无时间差）
  
物料全部达到上限暂停时：
  └─ 同无物料 → 空渲染
```

### 4.4 缓存策略

```
用户端 GET /api/v1/me/placements:
  └─ 后端缓存（Redis）：TTL 300s（5分钟）
  └─ 缓存键：placement:user:{userId}:{position}
  └─ 物料上下线时清除关联缓存
```

---

## 5. 排期引擎

### 5.1 基础排期

通过 `startAt` / `endAt` 实现物料按时段展示。

```
状态自动变迁：
  └─ 到达 startAt → 从 draft 自动变为 active（如果配置了自动激活）
  └─ 超过 endAt → 自动变为 ended
  └─ 后台每 5 分钟扫描一次（cron）执行状态变更
```

### 5.2 复杂排期规则

通过 `placement_item_schedule_rules` 支持更精细的排期：

```
类型 1: time_range
  用途：特定日期时段（如国庆 10/1-10/7）
  配置：startAt=10/1 00:00, endAt=10/7 23:59
  
类型 2: weekly
  用途：每周工作日白天展示（面向企业用户）
  配置：dayOfWeek=1-5, timeStart=09:00, timeEnd=18:00
  
类型 3: holiday_exception
  用途：节假日覆盖默认排期
  配置：holidayDate="2026-10-01", 替代当天默认物料
```

### 5.3 排期冲突检测

创建物料时自动检测时间冲突：

```
同一资源位，时间范围重叠的物料 ≥ maxSlots 时 → 告警提示：
  "该时段已有 X 个活跃物料（上限 Y 个），新物料可能不被展示"
  
允许强行创建（运营自主决定覆盖关系）。
```

---

## 6. 定向展示规则

### 6.1 目标类型

| 类型 | 说明 | 适用场景 |
|------|------|---------|
| `all` | 全平台展示（默认） | 通用公告/活动 |
| `segment` | 按用户分群 | 高价值用户专属活动 |
| `tags` | 按用户标签 | 打标用户运营 |
| `conditions` | 按条件表达式 | 复杂定向 |

### 6.2 Condition 表达式格式

复用 ref-4.10 的 FilterGroup 结构：

```typescript
interface FilterGroup {
  operator: "AND" | "OR";
  conditions: FilterCondition[];
}

interface FilterCondition {
  field: string;       // 如 "user_level", "balance", "registeredAt"
  operator: string;    // eq | neq | gt | gte | lt | lte | in | between
  value: any;          // 单值或数组
}
```

**示例：面向高级用户的充值 Banner**：
```json
{
  "operator": "AND",
  "conditions": [
    { "field": "user_level", "operator": "gte", "value": 3 },
    { "field": "balance", "operator": "lt", "value": 5000 }
  ]
}
```

### 6.3 定向优先级

同一资源位内，定向物料优先于全平台物料：

```
假设首页弹窗 maxSlots=1，有 3 个物料：
  A: targetType=all, priority=50
  B: targetType=segment, priority=30
  C: targetType=conditions, priority=40

当前用户属于 segment 但不满足 conditions：
  → 展示 B（segment 物料）
  
当前用户属于 segment 且满足 conditions：
  → 展示 C（conditions 更精确）
  
当前用户不属于任何定向：
  → 展示 A（兜底全平台）
```

---

## 7. AB 测试集成

### 7.1 启用流程

```
物料编辑页 → 勾选"加入 AB 测试"
  └─ 选择已有实验（下拉列表，来自 AB 测试模块）
  └─ 指定当前物料作为哪个变体（control / variant_a / variant_b）

系统逻辑：
  └─ 创建物料时写入 abTestId + abTestVariant
  └─ 渲染引擎解析时，检查用户是否在此 AB 实验中
  └─ 如果用户属于此实验 → 根据分流策略展示对应变体物料
  └─ 如果用户不属于此实验 → 不展示此物料（AB 测试专用物料）
```

### 7.2 数据集成

```
placement_events 中的 impression/click 自动关联到 AB 测试：
  └─ 实验报告可查看各变体的展示量/点击率/转化率
  └─ 自动计算显著性（p-value）和置信区间
  └─ 运营可在 AB 测试模块"确认优胜"后自动下架落选变体
```

详见 `ref-4.9-report-testing.md` AB 测试模块。

---

## 8. 埋点与统计分析

### 8.1 事件类型

| 事件 | 触发时机 | 上报方式 | 统计用途 |
|------|---------|---------|---------|
| `impression` | 物料渲染到 DOM 并可见 | 前端 IntersectionObserver | 曝光量 |
| `click` | 用户点击物料跳转 | 点击事件 | 点击量 / CTR |
| `dismiss` | 用户关闭弹窗/关闭横幅 | 关闭按钮点击 | 关闭率 |
| `close` | 物料被系统自动关闭 | — | 自动关闭统计 |

### 8.2 上报方式

```
前端埋点上报 POST /api/v1/me/placements/:itemId/event

主动上报：
  └─ impression: IntersectionObserver 检测到元素进入视口
  └─ click: 用户点击（默认跳转前上报）
  └─ dismiss: 用户关闭弹窗/关闭横幅

批量上报：
  └─ 初次加载时多个资源位同时可见 → 批量上报 impressions
  └─ 后端支持 batch 端点：POST /api/v1/me/placements/events/batch

限流：
  └─ 同用户同物料 5 秒内仅记录 1 次 impression（防重复渲染）
```

### 8.3 统计维度

| 维度 | 说明 | 图表 |
|------|------|-----|
| 曝光量（日/周/月） | 按时间聚合 | 折线图 |
| 点击量（日/周/月） | 按时间聚合 | 折线图 |
| CTR（日/周/月） | clickCount / impressionCount × 100% | 折线图 |
| 关闭率（弹窗） | dismissCount / impressionCount × 100% | 百分比卡片 |
| 各资源位对比 | 不同 position 的曝光/CTR | 柱状图 |
| 各物料对比 | 同资源位不同物料的曝光/CTR | 柱状图 |
| 设备分布 | PC vs 移动端的曝光占比 | 饼图 |
| 分群对比 | 不同分群的 CTR | 柱状图 |

### 8.4 统计 API

| 端点 | 用途 | 缓存 |
|------|------|------|
| `/api/v1/admin/placement-items/:id/stats` | 单物料统计 | TTL 60s |
| `/api/v1/admin/placement-items/stats/overview` | 全局概览 | TTL 300s |
| `/api/v1/admin/placements/:id/stats/trend` | 趋势数据 | TTL 300s |

**统计响应示例**：

```typescript
interface PlacementStats {
  summary: {
    totalImpressions: number;
    totalClicks: number;
    totalDismisses: number;
    ctr: number;             // 百分比
    dismissRate: number;     // 百分比
  };
  daily: {
    date: string;
    impressions: number;
    clicks: number;
    ctr: number;
  }[];
  byDevice: {
    device: string;
    impressions: number;
    clicks: number;
  }[];
}
```

---

## 9. API 接口规格

### 9.1 管理端 — 资源位定义

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/placements` | 资源位列表 | MARKETING_VIEW |
| POST | `/api/v1/admin/placements` | 创建资源位 | MARKETING_EDIT |
| PATCH | `/api/v1/admin/placements/:id` | 编辑资源位 | MARKETING_EDIT |
| DELETE | `/api/v1/admin/placements/:id` | 删除（无物料时） | MARKETING_EDIT |

### 9.2 管理端 — 物料管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/placement-items` | 物料列表（可筛选 placementId/status） | MARKETING_VIEW |
| POST | `/api/v1/admin/placement-items` | 创建物料 | MARKETING_EDIT |
| PATCH | `/api/v1/admin/placement-items/:id` | 编辑物料 | MARKETING_EDIT |
| DELETE | `/api/v1/admin/placement-items/:id` | 删除（仅 draft/ended/archived 可用）| MARKETING_EDIT |
| PATCH | `/api/v1/admin/placement-items/:id/status` | 变更状态 | MARKETING_EDIT |
| POST | `/api/v1/admin/placement-items/batch-status` | 批量变更状态 | MARKETING_EDIT |
| POST | `/api/v1/admin/placement-items/:id/clone` | 复制物料 | MARKETING_EDIT |

**PATCH status 请求体**：

```typescript
interface UpdateItemStatusInput {
  status: "active" | "paused" | "ended" | "archived";
  reason?: string;
}
```

### 9.3 管理端 — 排期规则

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/placement-items/:id/schedule-rules` | 排期规则列表 | MARKETING_VIEW |
| POST | `/api/v1/admin/placement-items/:id/schedule-rules` | 添加排期规则 | MARKETING_EDIT |
| DELETE | `/api/v1/admin/placement-items/:id/schedule-rules/:ruleId` | 删除排期规则 | MARKETING_EDIT |

### 9.4 管理端 — 统计

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/placement-items/:id/stats` | 物料统计 | MARKETING_VIEW |
| GET | `/api/v1/admin/placement-items/stats/overview` | 全局统计概览 | MARKETING_VIEW |
| GET | `/api/v1/admin/placements/:id/stats/trend` | 资源位趋势 | MARKETING_VIEW |

### 9.5 用户端

| 方法 | 路径 | 说明 | 权限 | 缓存 |
|------|------|------|------|------|
| GET | `/api/v1/me/placements` | 获取当前用户应展示的全部资源位 | user | Redis 300s |
| GET | `/api/v1/me/placements?position=home_banner_top` | 指定位置的物料 | user | Redis 300s |
| POST | `/api/v1/me/placements/:itemId/event` | 上报单事件 | user | — |
| POST | `/api/v1/me/placements/events/batch` | 批量上报 | user | — |

**GET placements 响应**：

```typescript
interface UserPlacementsResponse {
  placements: {
    [position: string]: {
      items: UserPlacementItem[];
      renderStrategy: string;
    }
  };
}

interface UserPlacementItem {
  id: number;
  name: string;
  mediaType: string;
  imageUrl?: string;
  imageMobileUrl?: string;
  imageAlt?: string;
  htmlContent?: string;
  textContent?: string;
  linkUrl?: string;
  linkTarget: string;
  // 弹窗特有
  popupWidth?: number;
  popupHeight?: number;
  popupDelayMs?: number;
  popupClosable?: boolean;
  popupOverlay?: boolean;
  popupOverlayClose?: boolean;
  popupFrequency?: string;
  // 悬浮按钮特有
  floatingIcon?: string;
  floatingText?: string;
  floatingBadge?: string;
}
```

---

## 10. 前端组件 Props

### 10.1 PlacementManager — 资源位管理页面

```typescript
interface PlacementManagerProps {
  // 路由页面组件，无外部 props
}
```

### 10.2 PlacementSidebar — 资源位导航侧栏

```typescript
interface PlacementSidebarProps {
  placements: PlacementNode[];
  activeId: string;             // 当前选中的 position
  onSelect: (position: string) => void;
}

interface PlacementNode {
  position: string;
  name: string;
  type: string;
  icon: string;                  // 图标
  activeCount: number;           // 当前活跃物料数
  maxSlots: number;
  isEnabled: boolean;
}
```

### 10.3 PlacementItemList — 物料列表

```typescript
interface PlacementItemListProps {
  placementId: number;
  items: PlacementItemSummary[];
  onAdd: () => void;
  onEdit: (id: number) => void;
  onClone: (id: number) => void;
  onStatusChange: (id: number, status: string) => void;
  onShowStats: (id: number) => void;
  loading: boolean;
}

interface PlacementItemSummary {
  id: number;
  name: string;
  mediaType: string;
  status: string;
  statusLabel: string;
  startAt?: string;
  endAt?: string;
  impressionCount: number;
  clickCount: number;
  ctr: number;
  priority: number;
  targetType: string;
  targetTypeLabel: string;
  createdByName: string;
  createdAt: string;
}
```

### 10.4 PlacementItemEditor — 物料编辑表单

```typescript
interface PlacementItemEditorProps {
  mode: "create" | "edit";
  placementId?: number;
  placementType: string;       // banner | popup | sidebar_banner | floating_button
  initialData?: Partial<PlacementItemFormData>;
  onSave: (data: PlacementItemFormData) => Promise<void>;
  onCancel: () => void;
}

interface PlacementItemFormData {
  name: string;
  mediaType: "image" | "html" | "text";
  imageUrl?: string;
  imageMobileUrl?: string;
  imageAlt?: string;
  htmlContent?: string;
  textContent?: string;
  linkUrl?: string;
  linkTarget: string;
  priority: number;
  startAt?: string;
  endAt?: string;
  maxImpressions?: number;
  maxClicks?: number;
  userFrequency: string;
  showOnLogin: boolean;
  targetType: string;
  segmentIds?: number[];
  tagIds?: number[];
  targetConditions?: FilterGroup;
  // 弹窗特有
  popupWidth?: number;
  popupHeight?: number;
  popupDelayMs?: number;
  popupClosable?: boolean;
  popupOverlay?: boolean;
  popupOverlayClose?: boolean;
  // 悬浮按钮特有
  floatingIcon?: string;
  floatingText?: string;
  floatingBadge?: string;
  // AB 测试
  abTestId?: number;
  abTestVariant?: string;
  // 排期规则
  scheduleRules?: ScheduleRuleInput[];
}

interface ScheduleRuleInput {
  ruleType: string;
  startAt?: string;
  endAt?: string;
  dayOfWeek?: number;
  timeStart?: string;
  timeEnd?: string;
}
```

### 10.5 PlacementItemPreview — 物料预览

```typescript
interface PlacementItemPreviewProps {
  type: string;                // banner | popup | sidebar_banner | floating_button
  data: PlacementItemFormData;
  device: "pc" | "mobile";
  width: number;               // 预览容器宽度
  height: number;              // 预览容器高度
}
```

### 10.6 PlacementRenderer — 用户端渲染

```typescript
// 渲染容器组件 — 按资源位位置名绑定
// HTML 中预留 <div data-placement="home_banner_top"/> 或者直接在布局组件中引入
// 由全局 PlacementProvider 统一管理

interface PlacementRendererProps {
  position: string;             // 资源位位置 key
  className?: string;
  onImpression?: (itemId: number) => void;
  onClick?: (itemId: number) => void;
  onDismiss?: (itemId: number) => void;
}

// 弹窗渲染器（特殊处理：全局单例）
interface PopupRendererProps {
  // 无 props，内部监听来自 PlacementEngine 的 popup 数据
  // 最多展示一个弹窗（排他性）
}

// 悬浮按钮渲染器
interface FloatingButtonRendererProps {
  // 全局单例，页面右下角固定
  items: UserPlacementItem[];
}
```

### 10.7 PlacementStatsCard — 统计卡片

```typescript
interface PlacementStatsCardProps {
  itemId: number;
  compact?: boolean;           // 紧凑模式（列表内嵌）
}

interface PlacementStatsData {
  summary: {
    impressions: number;
    clicks: number;
    ctr: number;
    dismisses: number;
  };
  trend: { date: string; impressions: number; clicks: number }[];
}
```

---

## 11. 运营配置项

| 配置项 | 路径 | 类型 | 默认值 | 说明 |
|-------|------|------|--------|------|
| 全局资源位启用 | `site_configs.placement.enabled` | boolean | true | 全局开关 |
| 轮播间隔 | `site_configs.placement.carousel_interval_ms` | int | 5000 | Banner 轮播切换毫秒数 |
| 弹窗最大宽度 | `site_configs.placement.popup_max_width` | int | 800 | 弹窗最大宽度(px) |
| 弹窗最大高度 | `site_configs.placement.popup_max_height` | int | 600 | 弹窗最大高度(px) |
| 用户端缓存 | `site_configs.placement.user_cache_ttl` | int | 300 | 用户端API缓存秒数 |
| 事件限流 | `site_configs.placement.event_rate_limit_ms` | int | 5000 | 同用户同物料事件记录间隔(ms) |
| 文件上传限制 | `site_configs.placement.max_file_size` | int | 2097152 | 素材最大字节数(2MB) |
| 批量上报 | `site_configs.placement.batch_enabled` | boolean | true | 是否启用批量事件上报 |
| 自动过期扫描 | `site_configs.placement.expiry_cron` | string | `*/5 * * * *` | 物料过期状态变更 cron |

---

## 12. 边界条件

### 12.1 数据边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B1 | 同一资源位活跃物料超过 maxSlots | 按定向精度→优先级→创建时间排序截断 |
| B2 | 物料 startAt/endAt 跨时区 | 统一使用 UTC 存储，前端按用户时区展示 |
| B3 | 素材图片加载失败 | 降级为 textContent（如有），否则隐藏该物料 |
| B4 | 素材尺寸与推荐尺寸不符 | 警告但不阻止上传，按 CSS object-fit: cover 处理 |

### 12.2 流程边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B5 | 物料 active 时编辑 | 允许编辑，修改后实时生效（清除缓存） |
| B6 | 物料已 ended 后想重新上线 | 不可直接激活，需复制新物料重新设置时间 |
| B7 | 弹窗被浏览器拦截 | 静默失败，不影响页面其他功能 |
| B8 | 物料上下线频率极高 | 后端缓存 5 分钟，配置变更后手动清除缓存 |

### 12.3 定向边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B9 | 用户分群/标签被删除 | 关联该分群的物料降级为 targetType=all |
| B10 | 用户不符合任何定向 | 展示 targetType=all 的物料作为兜底 |
| B11 | 匿名用户（未登录）| segment/tags/conditions 不生效，仅 all 类型物料展示 |
| B12 | 同一用户多个设备 | 每个设备独立计算频次（基于 sessionId）|

### 12.4 性能边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B13 | 全站所有页面同时请求 placements | Redis 缓存命中 > 95%，DB 查询频率可控 |
| B14 | 事件日志写入压力大 | 使用批量写入 + 异步队列，单次最大 100 条 |
| B15 | 同一页面 10+ 个资源位 | 首次请求聚合返回全部位置数据，减少请求次数 |

---

## 13. 验收标准

### 13.1 物料管理

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC1 | 创建物料 | 支持 image/html/text 三种类型，必填字段校验通过 |
| AC2 | 素材上传 | 图片上传 + 尺寸校验 + 格式校验正常 |
| AC3 | 状态流转 | draft→active→paused→ended→archived 全链路正常 |
| AC4 | 编辑物料 | 编辑后下次用户端请求即生效 |
| AC5 | 复制物料 | 复制生成新的 draft 物料，保留除时间外的所有字段 |

### 13.2 渲染引擎

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC6 | Banner 轮播 | 多物料时按配置间隔轮播，指示器正常 |
| AC7 | 弹窗展示 | 按配置延迟/频次弹出，遮罩层正常 |
| AC8 | 定向过滤 | 属于/不属于分群的用户看到不同物料 |
| AC9 | 兜底展示 | 不满足任何定向的用户看到全平台物料 |
| AC10 | 匿名用户 | 仅展示 targetType=all 的物料 |

### 13.3 排期与过期

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC11 | 排期自动上/下线 | startAt 到达自动 active，endAt 到达自动 ended |
| AC12 | 排期时间线 | 拖拽调整时间后物料状态实时更新 |
| AC13 | 曝光上限 | 物料达到 maxImpressions 后自动暂停 |

### 13.4 统计

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC14 | 事件上报 | impression/click/dismiss 正确记录 |
| AC15 | 批量上报 | 多事件批量写入正常 |
| AC16 | 统计展示 | 曝光/点击/CTR/关闭率数据正确 |
| AC17 | 趋势图 | 日/周/月趋势折线图正确 |

---

## 14. 交叉引用

| 关联模块 | 文档 | 关系 |
|---------|------|------|
| 用户分群 | `ref-4.10-user-segmentation.md` | 定向展示复用分群引擎 + 圈选条件 |
| AB 测试 | `ref-4.9-report-testing.md` | 物料关联 AB 实验，数据汇入实验报告 |
| 公告系统 | — | 资源位 ≠ 公告（公告是站内信，资源位是视觉曝光）|
| 通知规则 | `ref-4.14.5-notification-rules.md` | 物料性能异常（CTR 骤降）可触发告警 |
| 文件上传 | — | 素材文件上传复用现有服务 |
| 操作日志 | `ref-4.13-operation-timeline.md` | 关键操作（创建/发布/暂停/删除）写入操作日志 |
