import sys, os
path = r'C:\Users\ZH\.openclaw\workspace\3cloud\docs\PRD-README.md'
content = """

## 十、客服支撑模块增强（P0-P1 新增）

### 10.1 客服工作台

#### 背景

客服处理用户咨询时，需要同时查看用户信息、充值记录、调用日志、历史工单等，当前需要在 5 个页面之间来回切换，效率极低。

#### 功能规格

| 模块 | 说明 |
|------|------|
| 用户搜索入口 | 输入用户 ID/邮箱/手机号，统一搜索 |
| 信息聚合面板 | 一个页面展示：用户基本信息、余额状态、最近充值记录、最近调用日志、历史工单、余额变动流水 |
| 快捷操作 | 在工台内可直接操作用户（查看详情、调整余额、禁用/启用等）|
| 会话历史 | 最近与用户交互的工单和回复记录 |

#### API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/admin/support/user-search?q=` | 搜索用户（ID/邮箱/手机号模糊匹配）| 客服专员以上 |
| `GET` | `/api/v1/admin/support/user-dashboard/:userId` | 用户信息聚合面板数据 | 客服专员以上 |
| `GET` | `/api/v1/admin/support/user-timeline/:userId` | 用户操作时间线 | 客服专员以上 |

#### 前端变更

| 页面 | 变更 |
|------|------|
| 管理后台 → 新增"客服工作台"入口 | 统一搜索 + 信息聚合面板 |
| 客服工作台 → 用户详情 | 查看用户信息、余额、充值记录、调用日志、历史工单 |

---

### 10.2 知识库系统

#### 背景

客服每天回答大量重复问题（余额不足怎么办、兑换码怎么用、怎么开发票），当前全靠客服记忆或翻 FAQ 文档，效率低且新客服培训成本高。

#### 功能规格

| 模块 | 说明 |
|------|------|
| 知识库分类 | 按分类组织：充值/计费/Key/模型/发票/代理/安全/常见错误 |
| 文章管理 | 运营端创建/编辑/发布知识库文章，支持 Markdown 编辑 |
| 搜索功能 | 全文搜索知识库内容 |
| 用户端展示 | 帮助中心页面展示知识库文章（用户可自助查看）|
| 客服端快速引用 | 回复工单时可直接插入知识库文章链接或内容 |
| 浏览量统计 | 各文章的浏览次数、点赞/踩（帮助评估内容质量）|

#### 数据表变更

```typescript
// knowledge_base_articles
export const knowledgeBaseArticles = pgTable("knowledge_base_articles", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").references(() => knowledgeBaseCategories.id),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content").notNull(),
  summary: varchar("summary", { length: 300 }),
  tags: jsonb("tags"),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  authorId: integer("author_id").references(() => users.id),
  viewCount: integer("view_count").default(0),
  helpfulCount: integer("helpful_count").default(0),
  unhelpfulCount: integer("unhelpful_count").default(0),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// knowledge_base_categories
export const knowledgeBaseCategories = pgTable("knowledge_base_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  description: varchar("description", { length: 200 }),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

#### API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `POST` | `/api/v1/admin/knowledge-base/articles` | 创建文章 | operator 以上 |
| `PATCH` | `/api/v1/admin/knowledge-base/articles/:id` | 更新文章 | operator 以上 |
| `DELETE` | `/api/v1/admin/knowledge-base/articles/:id` | 删除文章 | operator 以上 |
| `GET` | `/api/v1/admin/knowledge-base/articles` | 文章列表 | 客服专员以上 |
| `GET` | `/api/v1/public/knowledge-base/articles` | 公开文章列表 | 无需登录 |
| `GET` | `/api/v1/public/knowledge-base/articles/:id` | 文章详情 | 无需登录 |
| `GET` | `/api/v1/public/knowledge-base/search?q=` | 全文搜索 | 无需登录 |
| `POST` | `/api/v1/public/knowledge-base/articles/:id/feedback` | 文章反馈（有用/没用）| 用户 |

#### 前端变更

| 页面 | 变更 |
|------|------|
| 运营 → 新增"知识库"入口 | 文章管理列表，支持创建/编辑/发布/归档 |
| 运营 → 知识库 → 编辑 | Markdown 编辑器，支持分类/标签/摘要设置 |
| Portal → 新增"/help"帮助中心页 | 按分类展示知识库文章，支持搜索 |
| 管理后台 → 工单详情 → 回复框 | 快速引用知识库文章 |

---

### 10.3 用户端帮助中心

#### 背景

很多问题用户其实可以自己解决，但当前 Portal 只有开发者文档，没有面向普通用户的帮助中心。客服 30% 以上的咨询量可以通过自助解决。

#### 功能规格

| 模块 | 说明 |
|------|------|
| 帮助中心首页 | 分类展示：充值/计费/API Key/模型/发票/代理商/常见错误 |
| 搜索 | 全文搜索帮助中心内容 |
| 热门文章 | 按浏览量自动排序的热门文章 |
| 联系客服 | 帮助中心底部提供联系客服入口（创建工单）|
| 知识库联动 | 帮助中心内容 = 知识库中已发布的文章 |

#### API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/public/help/categories` | 帮助中心分类列表 | 无需登录 |
| `GET` | `/api/v1/public/help/articles` | 文章列表（按分类筛选）| 无需登录 |
| `GET` | `/api/v1/public/help/articles/hot` | 热门文章 | 无需登录 |
| `GET` | `/api/v1/public/help/search?q=` | 全文搜索 | 无需登录 |

#### 前端变更

| 页面 | 变更 |
|------|------|
| Portal → 新增"/help"路由 | 帮助中心首页 |
| Portal → 帮助中心 → 详情 | 文章详情页 |
| Portal → 导航 | 新增"帮助中心"链接 |

---

### 10.4 快捷回复模板

#### 背景

客服回复工单时，很多场景是固定的（充值确认、Key 恢复、退款说明）。当前客服每次手动打字，效率低且容易出错。

#### 功能规格

| 模块 | 说明 |
|------|------|
| 模板管理 | 运营端创建/编辑/删除快捷回复模板 |
| 模板分类 | 按场景分类：充值/Key/退款/发票/代理/安全/通用 |
| 模板变量 | 支持变量替换：`{user_name}`, `{amount}`, `{order_id}` 等 |
| 工单快捷引用 | 回复工单时，从模板列表选择插入，自动替换变量 |

#### 数据表变更

```typescript
// quick_reply_templates
export const quickReplyTemplates = pgTable("quick_reply_templates", {
  id: serial("id").primaryKey(),
  category: varchar("category", { length: 20 }).notNull(),
  title: varchar("title", { length: 100 }).notNull(),
  content: text("content").notNull(),
  variables: jsonb("variables"),
  sortOrder: integer("sort_order").default(0),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

#### API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `POST` | `/api/v1/admin/quick-reply-templates` | 创建模板 | operator 以上 |
| `GET` | `/api/v1/admin/quick-reply-templates` | 模板列表 | 客服专员以上 |
| `PATCH` | `/api/v1/admin/quick-reply-templates/:id` | 更新模板 | operator 以上 |
| `DELETE` | `/api/v1/admin/quick-reply-templates/:id` | 删除模板 | operator 以上 |

#### 前端变更

| 页面 | 变更 |
|------|------|
| 运营 → 新增"快捷回复"入口 | 模板管理列表 |
| 工单详情 → 回复框 | 新增"插入模板"按钮 |

---

### 10.5 在线客服（WebChat）

#### 背景

用户遇到问题最快的方式是网页聊天。当前只有站内通知和邮件两种沟通方式，用户只能通过邮件或工单联系客服，响应慢。

#### 功能规格

| 模块 | 说明 |
|------|------|
| 用户端聊天按钮 | Portal 右下角悬浮聊天按钮，控制台内嵌聊天入口 |
| 会话管理 | 客服可同时接待多个会话，查看会话列表 |
| 消息类型 | 支持文字/图片 |
| 离线处理 | 客服离线时用户发送的消息自动创建工单 |
| 客服工作台集成 | 客服工作台内嵌在线客服面板 |
| 消息历史 | 保存最近 30 天聊天记录 |

#### API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `WS` | `/ws/chat` | 在线客服 WebSocket 连接 | 用户/客服专员以上 |
| `GET` | `/api/v1/admin/chat/sessions` | 当前活跃会话列表 | 客服专员以上 |
| `GET` | `/api/v1/admin/chat/sessions/:id/messages` | 会话消息历史 | 客服专员以上 |
| `POST` | `/api/v1/admin/chat/sessions/:id/close` | 关闭会话 | 客服专员以上 |

#### 前端变更

| 页面 | 变更 |
|------|------|
| Portal → 所有页面 | 右下角悬浮聊天按钮 |
| 用户控制台 | 内嵌聊天入口 |
| 客服工作台 | 新增"在线客服"面板 |

---

### 10.6 用户操作时间线

#### 背景

用户反馈问题时，客服需要快速了解用户最近做了什么。当前需翻多个页面拼信息，定位问题根因耗时很长。

#### 功能规格

| 模块 | 说明 |
|------|------|
| 时间线展示 | 按时间倒序展示用户操作：登录/创建Key/充值/调用API/禁用Key/提交工单/系统通知 |
| 时间范围 | 默认展示最近 7 天，支持自定义范围 |
| 事件来源 | 整合多个数据源：operation_logs + call_logs + recharge_orders + tickets + notifications |
| 事件类型过滤 | 按事件类型筛选：登录/Key/充值/调用/工单/系统 |

#### API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/admin/support/user-timeline/:userId` | 用户操作时间线 | 客服专员以上 |

#### 前端变更

| 页面 | 变更 |
|------|------|
| 客服工作台 → 用户详情 | 新增"操作时间线"标签页 |

---

### 10.7 客服支撑模块总览

| 模块 | 优先级 | 预估工作量 | 核心价值 |
|------|--------|-----------|---------|
| 客服工作台（统一用户查询）| P0 | 后端3d+前端4d | 客服日常工作的核心工具 |
| 知识库系统 | P0 | 后端4d+前端4d | 减少重复回答，降低培训成本 |
| 用户端帮助中心 | P0 | 前端3d | 减少 30% 客服咨询量 |
| 快捷回复模板 | P1 | 后端2d+前端2d | 提升工单回复效率 50% |
| 在线客服（WebChat）| P1 | 后端5d+前端5d | 实时响应，提升用户体验 |
| 用户操作时间线 | P1 | 后端2d+前端2d | 快速定位问题根因 |

**合计**：后端 16 人天 + 前端 20 人天 = 约 4.5 周
"""

with open(path, 'a', encoding='utf-8') as f:
    f.write(content)

print('OK')