# 深化参考：§10.2 知识库系统

> **对应**：[`PRD-客服支撑模块.md`](PRD-客服支撑模块.md) §10.2
> **关联**：[`SPEC-§26-工单系统.md`](SPEC-§26-工单系统.md)、[`SPEC-§27-在线客服与客服效能.md`](SPEC-§27-在线客服与客服效能.md)
> **优先级**：P0 | **状态**：需求文档（待开发）
> **最后更新**：2026-07-30

---

## 概述

知识库是客服体系的根基。客服每天回复大量重复问题（余额不足怎么办、兑换码怎么用、怎么开发票），当前全靠客服记忆或翻 FAQ 文档，效率低且新客服培训成本高。

**核心价值**：减少 30%+ 重复回复，降低新客服培训成本 50%，同时为用户自助（帮助中心）提供内容源。

---

## 功能模块

### 1. 分类管理

知识库文章按分类组织，支持多级分类（至多三级）。

| 预置分类 | slug | 说明 |
|---------|------|------|
| 充值 | recharge | 充值方式、流程、到账时间、对公转账 |
| 计费与账单 | billing | 价格说明、扣费规则、账单查看、发票 |
| API Key | api-key | 创建、权限设置、安全最佳实践 |
| 模型 | models | 模型列表、选择建议、上下文说明 |
| 兑换码 | redemption | 兑换码获取、使用、有效期 |
| 发票 | invoice | 发票申请、抬头设置、开票规则 |
| 代理 | agent | 代理等级、佣金、提现规则 |
| 安全 | security | 账户安全、2FA、IP白名单 |
| 常见错误 | errors | 错误码说明、解决方法 |

### 2. 文章管理

| 字段 | 类型 | 说明 |
|------|------|------|
| title | varchar(200) | 文章标题 |
| summary | varchar(300) | 搜索摘要，不超过 300 字 |
| content | text (Markdown) | 正文内容（支持 Markdown + 代码块） |
| categoryId | integer FK | 所属分类 |
| tags | jsonb | 标签数组，用于辅助搜索 |
| status | enum | draft / published / archived |
| authorId | integer FK | 创建者 |
| viewCount | integer | 浏览计数 |
| helpfulCount | integer | "有用"反馈数 |
| unhelpfulCount | integer | "没用"反馈数 |
| publishedAt | timestamptz | 首次发布时间 |
| createdAt | timestamptz | 创建时间 |
| updatedAt | timestamptz | 最后更新时间 |

### 3. 客服快速引用

客服在回复工单时，可直接从知识库搜索并插入文章链接或内容片段：

```
回复工单界面：
┌───────────────────────────────────────┐
│ 回复内容: [Markdown 编辑器]            │
│                                        │
│ [插入知识库 ▼]                         │
│  ┌─────────────────────────────────┐  │
│  │ 🔍 搜索知识库...                │  │
│  ├─────────────────────────────────┤  │
│  │ 📄 如何查看调用日志             │  │
│  │ 📄 兑换码使用说明               │  │
│  │ 📄 API Key 安全最佳实践         │  │
│  └─────────────────────────────────┘  │
└───────────────────────────────────────┘
选择后：
- 选中文章 → 插入 `[📄 文章标题](/help/articles/{id})` 链接
- 或选中后展开 → 插入文章内容摘要（最长 200 字）
```

### 4. 批量管理操作

| 操作 | 说明 |
|------|------|
| 批量发布 | 选中多条草稿，一键发布 |
| 批量归档 | 选中多条已发布文章，归档（对用户隐藏） |
| 批量转移分类 | 选中文章移动到其他分类 |
| 导入 | 支持从 Markdown 文件批量导入文章（ZIP 包） |
| 导出 | 按分类导出全部文章为 Markdown 文件（ZIP 包） |

### 5. 内容质量反馈

用户在帮助中心查看每篇文章后，可点击"有用 / 没用"。

| 指标 | 用途 |
|------|------|
| viewCount | 文章热度 |
| helpfulCount / viewCount | 有用率（< 60% 需优化内容） |
| unhelpfulCount | 用户明确反馈"没用"，运营需检查更新 |

---

## 数据表 Schema

```typescript
// knowledge_base_categories
export const knowledgeBaseCategories = pgTable("knowledge_base_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  parentId: integer("parent_id").references((): AnyPgColumn => knowledgeBaseCategories.id),
  description: varchar("description", { length: 200 }),
  icon: varchar("icon", { length: 30 }),         // emoji 或图标名称
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// knowledge_base_articles
export const knowledgeBaseArticles = pgTable("knowledge_base_articles", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").references(() => knowledgeBaseCategories.id),
  title: varchar("title", { length: 200 }).notNull(),
  summary: varchar("summary", { length: 300 }),
  content: text("content").notNull(),
  tags: jsonb("tags").$type<string[]>(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),  // draft | published | archived
  authorId: integer("author_id").references(() => users.id),
  viewCount: integer("view_count").default(0),
  helpfulCount: integer("helpful_count").default(0),
  unhelpfulCount: integer("unhelpful_count").default(0),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

---

## API 接口

### 运营端（知识库管理）

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/admin/knowledge-base/categories` | 分类列表（树形） | operator 以上 |
| `POST` | `/api/v1/admin/knowledge-base/categories` | 创建分类 | operator 以上 |
| `PATCH` | `/api/v1/admin/knowledge-base/categories/:id` | 编辑分类 | operator 以上 |
| `DELETE` | `/api/v1/admin/knowledge-base/categories/:id` | 删除分类（空分类可删） | operator 以上 |
| `GET` | `/api/v1/admin/knowledge-base/articles` | 文章列表（筛选 status/categoryId/search） | operator 以上 |
| `POST` | `/api/v1/admin/knowledge-base/articles` | 创建文章 | operator 以上 |
| `PATCH` | `/api/v1/admin/knowledge-base/articles/:id` | 更新文章 | operator 以上 |
| `DELETE` | `/api/v1/admin/knowledge-base/articles/:id` | 删除文章（软删除→archived） | operator 以上 |
| `POST` | `/api/v1/admin/knowledge-base/articles/:id/publish` | 发布文章（draft→published） | operator 以上 |
| `POST` | `/api/v1/admin/knowledge-base/articles/:id/archive` | 归档文章 | operator 以上 |
| `POST` | `/api/v1/admin/knowledge-base/batch/publish` | 批量发布 | operator 以上 |
| `POST` | `/api/v1/admin/knowledge-base/batch/archive` | 批量归档 | operator 以上 |
| `POST` | `/api/v1/admin/knowledge-base/batch/move-category` | 批量转移分类 | operator 以上 |
| `POST` | `/api/v1/admin/knowledge-base/import` | 导入 Markdown 文章 | operator 以上 |
| `GET` | `/api/v1/admin/knowledge-base/export?categoryId=` | 导出分类文章（ZIP） | operator 以上 |

### 客服端（快捷引用）

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/admin/support/kb-search?q=&limit=10` | 搜索知识库（客服引用用） | 客服专员 以上 |
| `GET` | `/api/v1/admin/support/kb-articles/:id` | 获取文章内容（客服引用用） | 客服专员 以上 |

### 公开端（帮助中心）

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/public/knowledge-base/categories` | 分类列表（仅已发布文章的分类） | 无需登录 |
| `GET` | `/api/v1/public/knowledge-base/articles?categoryId=&page=&limit=` | 文章列表（仅 published） | 无需登录 |
| `GET` | `/api/v1/public/knowledge-base/articles/:id` | 文章详情（仅 published） | 无需登录 |
| `GET` | `/api/v1/public/knowledge-base/search?q=` | 全文搜索 | 无需登录 |
| `POST` | `/api/v1/public/knowledge-base/articles/:id/feedback` | 反馈（helpful/unhelpful） | 用户 |

---

## 前端组件 Props

```tsx
// 管理端：文章列表
interface KbArticleListProps {
  articles: KbArticle[];
  categories: KbCategory[];
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onPublish: (id: number) => void;
  onBatchAction: (action: 'publish' | 'archive' | 'move', ids: number[]) => void;
  loading: boolean;
}

// 管理端：文章编辑器
interface KbEditorProps {
  article?: KbArticle;
  categories: KbCategory[];
  onSave: (data: Partial<KbArticle>) => Promise<void>;
  onPublish: (id: number) => Promise<void>;
}

// 客服引用弹窗
interface KbQuickReferenceProps {
  onInsert: (content: { type: 'link' | 'summary'; articleId: number; text: string }) => void;
  onClose: () => void;
}

// 公开端：帮助中心列表
interface HelpCenterListProps {
  categories: KbCategory[];
  articles: KbArticle[];
  onSearch: (q: string) => void;
  onCategoryChange: (slug: string) => void;
  onArticleClick: (id: number) => void;
  hotArticles?: KbArticle[];
}
```

---

## 边界条件

| 场景 | 处理方式 |
|------|---------|
| 分类下有文章时删除分类 | 不允许删除，提示"该分类下有 N 篇文章，请先转移" |
| 文章发布后编辑 | 编辑后自动保存为新版本？→ 直接覆盖更新，不建版本历史 |
| 同时打开多个编辑器 | 自动锁定编辑（Redis 锁 + 提示"xxxx 正在编辑"） |
| 导入文章 slug 冲突 | 自动添加后缀 `-2` `-3` |
| 全文搜索性能 | 使用 PostgreSQL `tsvector` 或 `ILIKE` + GIN 索引 |
| 客服引用搜索超时 | 降级返回最近 20 篇已发布文章 |
| 文章浏览计数刷量 | 按 user_id + IP + session 去重，同一用户每小时只计 1 次 |

---

## 验收标准

1. 运营端创建分类 → 创建文章（Markdown） → 发布 → 用户端帮助中心可看到
2. 知识库文章搜索支持标题 + 内容 + 标签全匹配
3. 客服回复工单时点击"插入知识库" → 搜索 → 选择 → 插入文章链接
4. 文章有用率统计正常：用户点击"有用/没用" → 计数更新
5. 批量发布/归档操作正常
6. 导入导出 ZIP 包格式正确，内容不丢失
7. 帮助中心页面 SEO 友好（服务端渲染或预生成）

---

## 关联模块

| 模块 | 关联方式 |
|------|---------|
| §10.3 帮助中心 | 知识库是帮助中心的内容源：帮助中心 = 知识库已发布文章按分类展示 |
| §10.4 快捷回复模板 | 知识库用于搜索引用；快捷回复模板用于固定回复插入，两者互补 |
| §26 工单系统 | 工单回复编辑器集成"插入知识库"功能 |
| §28 智能客服辅助 | 意图识别后可自动匹配知识库文章推送给客服 |

---

## 索引建议

```sql
-- 知识库
CREATE INDEX idx_kb_articles_status ON knowledge_base_articles(status);
CREATE INDEX idx_kb_articles_category ON knowledge_base_articles(category_id);
CREATE INDEX idx_kb_articles_search ON knowledge_base_articles USING gin(to_tsvector('simple', title || ' ' || coalesce(summary, '')));
```

---

### [?] 页面帮助
**页面名称**：知识库管理
**核心操作**：创建/编辑/发布知识库文章、管理分类、查看统计
**注意事项**：发布后的文章对用户立即可见，编辑前请确认内容无误；导入 ZIP 中仅支持 .md 和 .mdx 文件

### [?] 按钮级帮助对照表
| 按钮/操作 | 帮助说明 |
|----------|---------|
| 新建文章 | 创建一篇新的知识库文章，填写标题/分类/内容后保存为草稿 |
| 发布 | 将草稿文章发布到帮助中心，用户可见 |
| 批量操作 | 选中多篇文章后，可批量发布 / 归档 / 转移分类 |
| 导入 | 上传包含 .md 文件的 ZIP 包，按文件名自动创建文章 |
| 导出 | 按分类导出全部文章为 Markdown 文件打包下载 |
