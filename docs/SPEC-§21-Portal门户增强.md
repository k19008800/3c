# 功能说明书：§21 Portal 门户增强

> **对应文档**：[PRD-Portal门户增强]
> **状态**：草案（仅需求文档，不进入开发队列）
> **优先级**：P1（SEO/博客/帮助中心/联系表单/价格计算器）、P2（产品更新通知）

---


> **📖 页面功能说明帮助**
>
> **页面用途**：Portal 门户增强 功能说明书。本文档详细定义了该模块各功能点的字段规格、校验规则、边界条件、交互方式和注意事项。
>
> **适用角色**：所有访客和用户
>
> **核心操作**：
- 了解门户新功能
- 查看改进的注册和体验流程
>
> **注意事项**：本 SPEC 文档面向开发者和测试人员，包含字段级定义和校验规则。页面标题旁的 `[?]` 帮助气泡引用本文档内容，点击可查看当前页面功能说明。
>
> **关联组件**：页面标题右侧 `[?]` 帮助按钮，悬停/点击弹出帮助弹窗。



## 21.0 总览

### 功能描述

Portal 门户面向平台访客和潜在客户，当前仅有首页、定价页、模型目录、开发者文档四个页面。从用户视角看，门户缺乏 SEO 优化、内容运营渠道（博客/更新日志）、用户自助服务（帮助中心）、销售线索获取（联系表单）、交互辅助工具（价格计算器）等关键能力。本模块补充 6 个子需求，均为 Portal 端功能。

### 子模块清单

| 编号 | 模块 | 优先级 | 核心价值 |
|------|------|--------|---------|
| 21.1 | Portal 首页 SEO 优化 | P1 | 让搜索引擎能收录 Portal 页面，提升自然流量 |
| 21.2 | Blog / Changelog 模块 | P1 | 内容运营阵地，提升用户粘性和 SEO 内容量 |
| 21.3 | 帮助中心（Help Center） | P1 | 用户自助解决问题，降低客服成本 |
| 21.4 | 联系我们 / 销售咨询 | P1 | 获取销售线索，提升转化率 |
| 21.5 | 价格计算器 | P1 | 交互式成本预估，辅助购买决策 |
| 21.6 | 产品更新通知（用户侧） | P2 | 产品更新触达已注册用户 |

---

## 21.1 Portal 首页 SEO 优化

### 功能描述

当前 Portal 是纯 SPA 前端渲染，搜索引擎无法抓取内容。需要增加 SSR（服务端渲染）或静态化方案，使首页、定价页、模型目录页能被搜索引擎索引。

### 完成能力 / 展示效果

**SEO 元数据覆盖页面：**

| 页面 | URL | title | description |
|------|-----|-------|-------------|
| 首页 | `/` | 3Cloud - 一站式 AI API 聚合平台 | 接入 DeepSeek、OpenAI、Anthropic 等主流模型，统一计费、智能路由、精细运营 |
| 定价页 | `/pricing` | 3Cloud 定价 - 透明计费，按量付费 | 查看所有 AI 模型价格，输入输出分别计费，无隐藏费用 |
| 模型目录 | `/models` | 3Cloud 模型目录 - 138+ AI 模型 | DeepSeek、Qwen、GLM 等主流模型一览 |
| 文档页 | `/docs` | 3Cloud 开发者文档 - API 接入指南 | 快速接入 3Cloud API，兼容 OpenAI 格式，零代码迁移 |
| 状态页 | `/status` | 3Cloud 系统状态 - 服务健康实时监控 | 实时查看 3Cloud 各 API 端点和服务状态 |

**技术方案：**

推荐采用混合模式 — 首页/定价页/模型目录页/状态页使用 SSR，其他 Portal 页面保持 SPA。

```
SSR 渲染实现：
├── 框架: vike (vite-plugin-ssr)
├── SSR 页面: / /pricing /models /status /blog /blog/:slug
├── 渲染时机: 每次请求由 Node.js 服务端渲染
├── 缓存策略: Cache-Control: public, max-age=300（5 分钟缓存）
└── 降级方案: SSR 不可用时自动降级为 CSR（客户端渲染）
```

**SEO 增强文件：**

```
sitemap.xml:
└── 动态生成，包含所有重要页面 URL
└── 每个 URL 附带 lastmod / changefreq / priority
└── 文章/帮助文章/案例发布后自动追加

robots.txt:
└── 允许所有爬虫抓取
└── 指向 sitemap.xml

JSON-LD 结构化数据:
├── 首页: Organization + WebSite Schema
├── 定价页: Product + AggregateOffer Schema
├── Blog 页面: Article Schema
└── 面包屑: BreadcrumbList Schema（每个页面）
```

### 上下游关系

```
SSR 改造:
  ├── 前端: vike SSR 插件、Vite 配置、路由（page）迁移
  ├── 后端: Portal SSR 渲染服务器（独立于 API 服务器）
  │   ├── 监听端口: 3100（示例）
  │   └── 代理: Nginx 反代 Portal 请求到 SSR 服务器
  └── 运维: Nginx 配置区分 SSR 页面和 SPA 页面
```

### 边界条件

| 场景 | 处理方式 |
|------|---------|
| SSR 服务器宕机 | Nginx 回退到 SPA 模式（index.html），功能只影响 SEO，不影响用户交互 |
| 爬虫频繁请求 | SSR 页面缓存 5 分钟，减少服务器压力 |
| 动态内容（如模型数量）在 SSR 中过期 | SSR 页面中嵌入客户端初始化脚本，页面加载后更新动态数据 |
| 多语言 SEO | 初期仅支持中文，URL 结构 `/zh/...` 预留 |

### 验收标准

#### □ 流程图一致性校验 — 与对应流程图对比验证流程分支、异常处理、决策节点完全一致

1. 首页在搜索引擎中可被索引，显示正确 title 和 description
2. 定价页有独立 SEO 元数据，在搜索结果中正确展示
3. sitemap.xml 包含所有重要页面
4. JSON-LD 结构化数据通过 Google Rich Results Test 验证
5. SSR 服务器宕机时页面 CSR 降级正常工作，用户无感知

---

## 21.2 Blog / Changelog 模块

### 功能描述

产品更新日志（Changelog）和技术博客模块，让用户了解产品变化、新功能发布和技术动态。同时为 SEO 提供持续的内容产出能力。

### 完成能力 / 展示效果

**Portal 文章列表页 `/blog`：**

```
3Cloud Blog
  [全部] [产品更新] [技术博客] [公告]  [搜索...]

  产品更新 v2.1.0 - 智能路由升级与限流优化
  2026-07-25 | 2 分钟阅读
  本次更新引入加权轮询策略，支持自定义权重...

  如何在 5 分钟内接入 3Cloud API
  2026-07-20 | 5 分钟阅读
  3Cloud 兼容 OpenAI 格式，只需修改 base_url...

  [RSS 订阅]
```

**Portal 文章详情页 `/blog/:slug`：**

```
  产品更新 v2.1.0 - 智能路由升级与限流优化
  发布日期: 2026-07-25 | 作者: 3Cloud 团队

  [文章内容...]

  分享: [Twitter] [微博] [复制链接]

  相关文章:
  - v2.0.0 发布公告 - 统一计费与多模型支持
  - 智能路由技术原理详解
```

**管理后台文章编辑器：**

```
  标题: [________________________]
  Slug: [v2-1-0-smart-routing-upgrade]  [自动生成]
  分类: [产品更新 ▼]
  标签: [智能路由] [限流] [优化]
  封面图: [选择图片]
  状态: [草稿 ▼]
  定时发布: [2026-07-30 10:00]（可选）
  SEO 标题: [________________]
  SEO 描述: [________________]

  [Markdown 编辑器区域]
  [预览] [保存草稿] [发布] [定时发布]
```

### 数据表结构

```typescript
// blog_posts — 文章
export const blogPosts = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 200 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  excerpt: varchar("excerpt", { length: 500 }),
  content: text("content").notNull(),
  contentType: varchar("content_type", { length: 20 }).notNull().default("blog"),
    // 'changelog' | 'blog' | 'announcement' | 'case_study'
  status: varchar("status", { length: 20 }).notNull().default("draft"),
    // 'draft' | 'published' | 'archived'
  coverImage: varchar("cover_image", { length: 500 }),
  tags: text("tags"),  // 逗号分隔
  authorId: integer("author_id").references(() => users.id),
  publishedAt: timestamp("published_at"),
  scheduledAt: timestamp("scheduled_at"),  // 定时发布
  seoTitle: varchar("seo_title", { length: 200 }),
  seoDescription: varchar("seo_description", { length: 500 }),
  viewCount: integer("view_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### API 接口

#### 公开接口（无需登录）

```
GET  /api/v1/public/blog                  — 文章列表（分页, 支持 type/tag/search 筛选）
GET  /api/v1/public/blog/:slug            — 文章详情（按 slug）
GET  /api/v1/public/blog/rss              — RSS Feed
```

#### 管理后台接口（需管理员权限）

```
GET    /api/v1/admin/blog                 — 文章管理列表
POST   /api/v1/admin/blog                 — 创建文章
PUT    /api/v1/admin/blog/:id             — 更新文章
DELETE /api/v1/admin/blog/:id             — 删除文章
POST   /api/v1/admin/blog/:id/publish     — 发布
POST   /api/v1/admin/blog/:id/unpublish   — 取消发布
```

### 前端组件

```tsx
// Portal 端
<BlogList
  posts: BlogPost[]
  categories: string[]
  selectedCategory: string
  searchQuery: string
  onSearch: (q: string) => void
  onCategoryChange: (cat: string) => void
  onPageChange: (page: number) => void
  totalPages: number
  loading: boolean
/>

<BlogDetail
  post: BlogPost
  relatedPosts: BlogPost[]
  onShare: (platform: string) => void
/>

<RssFeedLink url="/api/v1/public/blog/rss" />

// 管理后台
<BlogAdminList
  posts: BlogPostAdmin[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onPublish: (id: string) => void
/>

<BlogEditor
  post?: BlogPost
  categories: string[]
  onSave: (data: BlogPostFormData) => void
  mode: 'create' | 'edit'
/>
```

### 上下游关系

```
Blog 模块:
  ├── 前端: BlogList / BlogDetail / BlogEditor / BlogAdminList
  ├── 后端: 公开 API + 管理 API + 定时发布 cron 任务
  ├── 数据库: blog_posts 表（新增）
  └── RSS: 只需添加 XML 路由，无需额外依赖
```

### 边界条件

| 场景 | 处理方式 |
|------|---------|
| 文章定时发布 | 后端 cron 每分钟检查 `scheduledAt ≤ now AND status=draft` → 自动设为 published |
| slug 冲突 | slug 唯一索引 → 重复 slug 自动追加数字后缀（如 `v2-1-0-1`） |
| 文章删除 | 软删除（status=archived），列表页过滤 archived |
| RSS 大文章量 | 最多返回最近 50 条 |
| 封面图过大 | 上传时限制 5MB，自动压缩为 1200×630px（OG 标准尺寸） |

### 验收标准

1. 管理员创建文章 → 设置分类/标签/封面图 → 发布 → Portal 可见
2. 管理员设置定时发布 → 到时间自动发布
3. 文章列表页支持分类筛选、搜索
4. RSS Feed 可被 RSS 阅读器识别和订阅
5. 文章详情页显示正确 SEO 元数据
6. 删除文章 → Portal 不再显示

---

## 21.3 帮助中心（Help Center）

### 功能描述

面向最终用户的帮助中心，包含分类知识库、全文搜索、文章反馈，降低用户咨询成本和客服压力。

### 完成能力 / 展示效果

**Portal 帮助中心首页 `/help`：**

```
帮助中心
  [搜索帮助文章...]

  📖 入门指南              🔐 账号管理
  快速接入 API Key...      如何更改密码...

  💰 计费与充值            🔌 API 接入
  了解计费方式...           API 鉴权和调用...

  ❓ 常见问题              🔧 故障排除
  余额不足怎么办...         调用超时处理...
```

**Portal 帮助文章详情 `/help/:category/:slug`：**

```
如何创建 API Key
  [打印] [复制链接]

  1. 登录 3Cloud 控制台
  2. 点击左侧"API Keys"
  3. 点击"创建 Key"
  ...

  这篇文章有帮助吗？ [👍 是 (23)] [👎 否 (2)]
```

**管理后台帮助文章管理：**

```
帮助分类管理:
  [入门指南]  [账号管理]  [计费]  [+ 添加分类]

帮助文章列表:
  [搜索...]
  如何创建 API Key       入门指南    草稿    2026-07-25  [编辑] [删除]
  了解计费方式           计费与充值  已发布  2026-07-24  [编辑] [删除]

统计概览:
  总文章: 12 | 已发布: 8 | 浏览量: 1,234 | 有用率: 85%
  搜索热词: 发票 (45) / API Key (32) / 余额 (28)
```

### 数据表结构

```typescript
// help_categories — 帮助分类
export const helpCategories = pgTable("help_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: varchar("description", { length: 300 }),
  icon: varchar("icon", { length: 50 }),  // 图标名称
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// help_articles — 帮助文章
export const helpArticles = pgTable("help_articles", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 200 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content").notNull(),
  categoryId: integer("category_id").references(() => helpCategories.id),
  tags: text("tags"),
  status: varchar("status", { length: 20 }).default("draft"),
  authorId: integer("author_id").references(() => users.id),
  viewCount: integer("view_count").default(0),
  helpfulCount: integer("helpful_count").default(0),
  notHelpfulCount: integer("not_helpful_count").default(0),
  sortOrder: integer("sort_order").default(0),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### API 接口

#### 公开接口（无需登录）

```
GET  /api/v1/public/help                      — 帮助分类列表
GET  /api/v1/public/help/articles             — 文章列表（支持 category / search）
GET  /api/v1/public/help/articles/:slug       — 文章详情
POST /api/v1/public/help/articles/:id/feedback — 提交反馈 { helpful: boolean }
```

#### 管理后台接口（需管理员权限）

```
GET    /api/v1/admin/help                     — 文章管理列表
POST   /api/v1/admin/help                     — 创建文章
PUT    /api/v1/admin/help/:id                 — 更新文章
DELETE /api/v1/admin/help/:id                 — 删除文章
GET    /api/v1/admin/help/categories          — 分类列表
POST   /api/v1/admin/help/categories          — 创建分类
PUT    /api/v1/admin/help/categories/:id      — 更新分类
DELETE /api/v1/admin/help/categories/:id      — 删除分类
GET    /api/v1/admin/help/stats               — 统计分析（浏览量 / 有用率 / 搜索热词）
```

### 前端组件

```tsx
<HelpCenter
  categories: HelpCategory[]
  onSearch: (query: string) => void
/>

<HelpCategory
  category: HelpCategory
  articles: HelpArticle[]
  onArticleClick: (slug: string) => void
/>

<HelpArticle
  article: HelpArticle
  relatedArticles: HelpArticle[]
  onFeedback: (helpful: boolean) => void
/>

<HelpSearch
  query: string
  results: SearchResult[]
  onResultClick: (slug: string) => void
  loading: boolean
/>

<HelpFeedback articleId: string helpfulCount: number notHelpfulCount: number />

// 管理后台
<HelpAdminList />
<HelpAdminEditor />
<HelpAdminCategories />
<HelpAdminStats />
```

### 上下游关系

```
帮助中心:
  ├── 数据库: help_categories + help_articles + help_search_logs（新增表）
  ├── 后端: 公开 API + 管理 API + 全文搜索
  ├── 前端: Portal 帮助页 + 管理后台文章管理
  └── 搜索: 使用 PostgreSQL 全文搜索（tsvector）或 Elasticsearch（如已部署）
```

### 边界条件

| 场景 | 处理方式 |
|------|---------|
| 搜索无结果 | 显示"没有找到答案" → 建议联系客服（跳转 `/contact`） |
| 文章不存在 | 404 页面 + 推荐相关文章 |
| 分类下无文章 | 显示"暂无文章" + 其他分类推荐 |
| 反馈数字过大 | 仅显示显示整数，不显示小数（如"有帮助 23 人"） |

### 验收标准

1. Portal 帮助中心显示分类卡片
2. 用户点击分类 → 显示该分类文章列表
3. 用户搜索"API Key" → 显示相关文章，关键词高亮
4. 用户查看文章 → 点击"有帮助" → 统计数据更新
5. 管理员创建分类 → 创建文章 → 发布 → Portal 可见
6. 帮助中心统计显示正确浏览量和有用率

---

## 21.4 联系我们 / 销售咨询

### 功能描述

Portal 提供联系我们入口，支持在线表单提交，方便潜在客户咨询和获取技术支持，同时为销售团队获取线索。

### 完成能力 / 展示效果

**Portal 联系表单页 `/contact`：**

```
联系我们
  我们会在 1-2 个工作日内联系您

  姓名:   [________]
  邮箱:   [________]
  手机号: [________]（可选）
  主题:   [产品咨询 ▼]
  消息:   [____________________]

  [验证码: 拖动滑块验证]

  [提交]
```

**管理后台咨询列表：**

```
客户咨询                    [导出 CSV]
  [待处理]  [处理中]  [已处理]

  张三 | zhang@example.com | 产品咨询 | 2026-07-25 14:23  | [处理中] [详情]
  李四 | li@example.com   | 商务合作 | 2026-07-25 12:10  | [待处理] [详情]

  新咨询到达时 → 管理员通知（站内信 + 邮件）
```

### 数据表结构

```typescript
// contact_inquiries — 咨询表单
export const contactInquiries = pgTable("contact_inquiries", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  subject: varchar("subject", { length: 50 }).notNull(),  // 'product' | 'business' | 'support' | 'other'
  message: text("message").notNull(),
  status: varchar("status", { length: 20 }).default("pending"),  // pending / processing / resolved
  assigneeId: integer("assignee_id").references(() => users.id),
  internalNote: text("internal_note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});
```

### API 接口

#### 公开接口（无需登录，有限流）

```
POST /api/v1/public/contact  — 提交咨询表单
      请求体: { name, email, phone?, subject, message, captchaToken }
      限流: 每 IP 每小时 3 次
```

#### 管理后台接口（需管理员权限）

```
GET    /api/v1/admin/contact               — 咨询列表（分页，支持 status 筛选）
GET    /api/v1/admin/contact/:id           — 咨询详情
PUT    /api/v1/admin/contact/:id/status    — 更新状态
PUT    /api/v1/admin/contact/:id/note      — 添加备注
GET    /api/v1/admin/contact/export        — 导出 CSV
```

### 前端组件

```tsx
<ContactForm
  subjects: { value: string; label: string }[]
  onSubmit: (data: ContactFormData) => Promise<void>
  captchaKey: string
  loading: boolean
/>

<ContactSuccess onDone: () => void />

// 管理后台
<AdminContactList
  inquiries: ContactInquiry[]
  onViewDetail: (id: string) => void
  onExport: () => void
/>

<AdminContactDetail
  inquiry: ContactInquiry
  onStatusChange: (status: string) => void
  onAddNote: (note: string) => void
  onClose: () => void
/>
```

### 上下游关系

```
联系我们:
  ├── 后端: 公开 API（验证码校验 + 限流）+ 管理 API + 邮件发送
  ├── 数据库: contact_inquiries 表（新增）
  ├── 外部依赖: 验证码服务（极验/腾讯云验证码）、邮件服务
  └── 通知: 新咨询到达 → 通知管理员（站内信 + 邮件）
```

### 边界条件

| 场景 | 处理方式 |
|------|---------|
| 表单字段校验失败 | 在对应字段下方显示具体错误原因 |
| 验证码失败 | 刷新验证码，提示重新操作 |
| 频繁提交（同一 IP 1 小时内 > 3 次） | 返回 429 "提交过于频繁，请稍后再试" |
| 提交成功后邮件发送失败 | 不影响用户反馈，后端重试 3 次，记录错误日志 |
| 用户重复提交同一内容 | 后端 5 分钟内同一邮箱+消息内容视为重复，拒绝并提示"已收到您的咨询" |

### 验收标准

1. 用户填写联系表单 → 提交 → 显示成功提示
2. 用户提交后收到确认邮件（含咨询编号）
3. 管理员后台看到新咨询 → 查看详情 → 标记处理中 → 添加备注 → 标记已处理
4. 新咨询到达时管理员收到通知
5. 导出 CSV → 文件包含所有咨询信息，正确格式

---

## 21.5 价格计算器

### 功能描述

在 Portal 定价页增加交互式价格计算器，用户选择模型、输入 Token 数、输出 Token 数，实时计算费用。支持多模型对比和分享计算结果。

### 完成能力 / 展示效果

**定价页计算器区域：**

```
价格计算器
  模型: [deepseek-chat ▼]
  输入 Tokens: [1000       ]
  输出 Tokens: [500        ]

  输入单价: ¥0.50 / 1K Tokens
  输出单价: ¥0.20 / 1K Tokens
  预估费用: ¥0.6000
  ------------
  + 对比模式 [添加模型]
  deepseek-chat:  ¥0.6000
  qwen-plus:      ¥0.9000
  glm-4-flash:    ¥0.1200

  [复制计算链接]
```

### 前端组件

```typescript
interface PriceCalculatorProps {
  models: PricingModel[]
  initialModel?: string
}

interface PricingModel {
  id: string
  name: string
  vendor: string
  inputPrice: number    // ¥/1K tokens
  outputPrice: number
  contextLength: number
  category: string
}

interface CalculationResult {
  inputCost: number
  outputCost: number
  totalCost: number
  inputTokens: number
  outputTokens: number
  inputPerUnit: number
  outputPerUnit: number
}

// 组件树
PriceCalculator
├── ModelSelector           — 模型下拉
├── TokenInputs            — Input/Output Token 输入（带滑动条）
├── PriceBreakdown         — 费用明细展示
├── UnitToggle             — Token/字符单位切换
├── PriceComparison        — 多模型对比（可添加 2-3 个模型）
└── ShareButton            — 生成带参数的可分享 URL
```

### 上下游关系

```
价格计算器:
  └── 数据来源: GET /api/v1/public/pricing（5 分钟缓存）
  └── 纯前端计算，不涉及后端 API
  └── 分享功能: 生成 URL 参数 /pricing?model=xxx&input=1000&output=500
```

### 边界条件

| 场景 | 处理方式 |
|------|---------|
| Token 数为 0 | 费用显示 ¥0.0000 |
| Token 数过大（> 1B） | 输入框上限锁定 1,000,000,000 |
| 模型价格数据加载失败 | 显示"暂无法获取价格" + 重试按钮 |
| 对比模式添加重复模型 | 不允许添加已有模型 |

### 验收标准

1. 选择模型 → 输入 Token 数 → 实时显示费用
2. 切换模型 → 费用自动重新计算
3. 对比模式 → 显示多个模型的费用并排
4. 分享计算链接 → 打开后自动填充参数和结果

---

## 21.6 产品更新通知（用户侧）

### 功能描述

当 Portal 发布新文章（Changelog/Blog）时，已登录用户通过站内通知和邮件收到更新通知，确保用户及时了解产品变更。

### 完成能力 / 展示效果

**通知触发场景：**

```
管理员在后台发布 Changelog 类型文章
  └── 自动触发通知系统
      ├── 所有用户站内通知: "📢 新功能发布：v2.1.0"
      └── 用户在通知中心看到该条通知

管理员发布 Blog 类型文章
  └── 自动触发通知系统
      └── 关注了博客更新的用户收到通知

管理员发布 Announcement 类型文章
  └── 自动触发通知系统
      ├── 所有用户站内通知
      └── 开启了邮件通知的用户收到邮件
```

**通知内容格式：**

```
站内通知:
  "📢 新功能发布：v2.1.0 智能路由升级"
  摘要: 本次更新引入加权轮询策略...
  时间: 2026-07-25 14:00
  [查看详情 → /blog/v2-1-0-smart-routing-upgrade]

邮件通知:
  标题: [3Cloud] 新功能发布：v2.1.0 智能路由升级
  内容: 文章摘要 + [查看完整内容] 链接
```

### API 接口

```
// 复用已有的通知系统
POST /api/v1/admin/notifications/broadcast
  触发时机: 管理员点击"发布"时自动调用
  目标: 所有用户 或 指定角色
  通知类型: 'changelog' | 'blog' | 'announcement'
```

### 上下游关系

```
产品更新通知:
  ├── 触发: Blog 文章发布事件
  ├── 后端: 发布时自动调用通知系统 broadcast API
  └── 依赖: §21.2 Blog 模块 + 现有通知系统 + 邮件服务
```

### 边界条件

| 场景 | 处理方式 |
|------|---------|
| 管理员编辑已发布的文章（不重新发布） | 不触发二次通知 |
| 管理员发布并立即撤回 | 如果已有用户阅读通知，不撤回 |
| 通知推送失败 | 记录错误，不阻塞文章发布流程 |
| 同一用户多次触发同类通知 | 按通知频率限制（同一事件每分钟最多推送一次） |

### 验收标准

1. 管理员发布 Changelog → 所有用户收到站内通知
2. 用户点击通知 → 跳转到 Portal 文章详情页
3. 用户关闭通知 → 通知标记为已读，不再显示
4. 管理员编辑已发布文章 → 不产生重复通知

---

## Portal 增强总览

| 模块 | 编号 | 优先级 | 核心价值 | 依赖 |
|------|------|--------|---------|------|
| SEO 优化 | §21.1 | P1 | 自然流量增长 | 前端 SSR 改造 |
| Blog / Changelog | §21.2 | P1 | 内容运营 + SEO 内容 | 管理后台 + 数据库 |
| 帮助中心 | §21.3 | P1 | 用户自助服务 | 管理后台 + 数据库 |
| 联系我们 | §21.4 | P1 | 销售线索转化 | 邮件服务 + 验证码服务 |
| 价格计算器 | §21.5 | P1 | 购买决策辅助 | 现有定价 API |
| 产品更新通知 | §21.6 | P2 | 用户触达 | 通知系统 + Blog |
| 在线 Demo 体验 | §21.7 | P1 | 降低试用门槛、获客转化 | 后端 Demo API + Redis 限流 |
| 系统状态页增强 | §21.8 | P2 | 展示专业度 | 后端监控 API + WebSocket |
| 平台对比页面 | §21.9 | P2 | 说服访客选择 | 定价 API + 静态内容 |
| 免费 API Key 引导条 | §21.10 | P0 | 全站获客引流 | 仅前端组件 |
| SLA 与合规页面 | §21.11 | P1 | 企业客户信任背书 | 静态内容 + CMS |
| 客户案例 | §21.12 | P2 | 信任背书 | Blog 模块复用 |

### 技术依赖分析

```
§21.7 在线 Demo 体验
  ├── 后端: 公开 Demo API + Redis 限流/封禁/验证码状态
  ├── 路由引擎: 调用指定模型（复用）
  ├── 数据库: demo_access_logs + demo_blocked_ips（新增表）
  └── 外部依赖: 滑块验证码服务

§21.8 系统状态页增强
  ├── 后端: 公开状态 API + 供应商健康检查数据
  ├── 数据库: system_incidents + status_page_subscribers（新增表）
  ├── 邮件: 状态变更通知发送
  └── WebSocket: 实时状态推送（可选）

§21.9 平台对比页
  └── 前端: CompareTable / ComparePricing 组件（纯展示 + 定价 API 数据）

§21.10 免费 Key 引导条
  └── 前端: FreeApiKeyBanner 组件（仅前端，无后端变更）

§21.11 SLA 合规页
  ├── 后端: SLA API + CMS 编辑
  └── 文件: SLA PDF 上传/下载

§21.12 客户案例
  └── 复用 §21.2 Blog 模块，新增 case_study 内容类型
```

### 数据迁移要求

所有功能均为**新增表**，不修改现有表结构。无迁移风险。

| 表 | 用途 | 初始种子数据 |
|------|------|-------------|
| `blog_posts` | 博客/Changelog/案例文章 | 建议预设 3-5 篇 |
| `help_articles` | 帮助文章 | 建议预设 10-15 篇 |
| `help_categories` | 帮助分类 | 6 个种子分类 |
| `contact_inquiries` | 咨询表单 | 无 |
| `demo_access_logs` | Demo 访问日志 | 无 |
| `demo_blocked_ips` | Demo 封禁 | 无 |
| `system_incidents` | 故障事件 | 无 |
| `status_page_subscribers` | 状态订阅 | 无 |

### 路由规划

```
Portal 公共路由（全部公开，无需登录）：
  /                          → 首页（SSR）
  /pricing                   → 定价页 + 价格计算器（SSR）
  /models                    → 模型目录（SSR）
  /docs                      → 开发者文档
  /status                    → 服务状态页（SSR）
  /blog                      → 博客文章列表（SSR）
  /blog/:slug                → 博客文章详情（SSR）
  /help                      → 帮助中心首页
  /help/:category            → 帮助分类页
  /help/:category/:slug      → 帮助文章详情页
  /help/search               → 搜索结果页
  /contact                   → 联系我们表单页
  /demo                      → 在线 API 体验页
  /compare                   → 平台对比页
  /sla                       → SLA 与合规页
  /cases                     → 客户案例页
  /cases/:slug               → 案例详情页
  /sitemap.xml               → 站点地图
  /robots.txt                → 爬虫规则
```


---

### [?] 页面帮助

**页面名称**：Portal 门户增强

**适用角色**：所有访客和潜在客户

**功能定位**：面向平台访客和潜在客户的门户能力增强：SEO 优化、内容运营（Blog/Changelog）、用户自助服务（帮助中心）、销售线索获取（联系表单）、交互式价格计算器、产品更新通知。

**子模块说明**：
- §21.1 Portal 首页 SEO 优化：结构化数据、meta 标签、sitemap，提升搜索引擎收录
- §21.2 Blog / Changelog 模块：内容运营阵地，提升用户粘性和 SEO 内容量
- §21.3 帮助中心（Help Center）：用户自助搜索常见问题，降低客服成本
- §21.4 联系我们 / 销售咨询：获取销售线索，提升转化率
- §21.5 价格计算器：交互式成本预估，辅助购买决策
- §21.6 产品更新通知：订阅产品更新/版本发布通知

**注意事项**：
- 门户为公开页面，无需登录即可访问
- Blog/Changelog 内容由运营后台发布管理
- 帮助中心内容与客服知识库联动
- 价格计算器基于公开定价页数据

**常见问题**：
Q: 门户页面为什么搜索不到？
A: SEO 优化（结构化数据/sitemap）完成后需要搜索引擎爬虫重新收录，通常需要数天到数周。

Q: 帮助中心的内容从哪里来？
A: 与客服知识库联动，运营可在后台统一维护。

Q: 价格计算器准确吗？
A: 基于公开定价计算，仅作估算参考，实际费用以账单为准。

### [?] 按钮级帮助对照表

**§21.1 SEO 优化**

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 查看 SEO 状态（管理员） | 查看各页面 SEO 配置和收录状态 |

**§21.2 Blog / Changelog**

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 浏览文章 | 查看博客文章和产品更新日志 |
| 搜索文章 | 按关键词搜索内容 |
| 发布文章（管理员） | 在后台发布新文章/更新日志 |

**§21.3 帮助中心**

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 搜索问题 | 输入关键词搜索帮助文章 |
| 浏览分类 | 按分类浏览帮助内容 |
| 联系我们 | 未找到答案时跳转联系表单 |

**§21.4 联系我们 / 销售咨询**

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 提交咨询 | 填写联系方式和需求，提交销售咨询 |
| 提交工单 | 已有账号用户直接提交工单 |

**§21.5 价格计算器**

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 输入用量 | 输入预估调用量/模型选择 |
| 计算费用 | 基于公开定价估算月费用 |
| 查看明细 | 查看分项费用估算明细 |

**§21.6 产品更新通知**

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 订阅更新 | 输入邮箱订阅产品更新通知 |
| 取消订阅 | 取消产品更新邮件订阅 |

