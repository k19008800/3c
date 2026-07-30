# 深化参考：§11.7 销售知识库

> **对应**：[`PRD-业务员支撑.md`](PRD-业务员支撑.md) §11.7
> **关联**：[`ref-10.2-knowledge-base.md`](ref-10.2-knowledge-base.md)、[`ref-4.5-marketing.md`](ref-4.5-marketing.md)、[`ref-4.3-vendor-model.md`](ref-4.3-vendor-model.md)
> **优先级**：P1 | **状态**：需求文档（待开发）
> **最后更新**：2026-07-30

---

## 概述

业务员在向客户介绍产品时需要快速查阅产品功能、定价、竞品对比等信息。当前信息分散在各处，业务员需要自行整理文档或咨询上级，效率低下且信息可能不统一。

**核心价值**：为业务员提供一站式的产品知识查阅平台，涵盖产品速查、定价指南、竞品对比、常见问答、案例库，支持全文搜索。

---

## 功能模块

### 1. 产品速查

按产品线分类展示，每篇文章包含：

| 字段 | 说明 |
|------|------|
| 产品名称 | 如 DeepSeek V4、Qwen-Max、GPT-4o |
| 功能介绍 | 核心能力描述（文本生成、推理、多模态等）|
| 核心卖点 | 3-5 个关键卖点（价格优势、响应速度、上下文窗口等）|
| 适用场景 | 推荐的应用场景列表 |
| 技术参数 | 上下文窗口、最大 Token、支持语言、速率限制 |
| 版本差异 | 同一模型不同版本的区别 |

**分类结构**：

```
产品速查
├── 文本生成模型
│   ├── DeepSeek V4
│   ├── Qwen-Max
│   ├── GPT-4o
│   └── Claude 3.5 Sonnet
├── 多模态模型
│   ├── GPT-4o Vision
│   └── Gemini 2.0
├── 代码模型
│   ├── DeepSeek Coder
│   └── Claude 3.5 Opus
└── 向量与嵌入
    ├── text-embedding-3
    └── bge-large-zh
```

### 2. 定价指南

各模型定价速查表（示例数据，以系统配置为准）：

| 模型 | 输入价格（/百万 Token） | 输出价格（/百万 Token） | 计费单位 |
|------|----------------------|----------------------|---------|
| DeepSeek V4 Flash | ¥0.50 | ¥2.00 | Token |
| DeepSeek V4 Pro | ¥4.00 | ¥12.00 | Token |
| Qwen-Max | ¥2.00 | ¥6.00 | Token |
| GPT-4o | ¥15.00 | ¥60.00 | Token |
| Claude 3.5 Sonnet | ¥12.00 | ¥45.00 | Token |

**折扣策略**：

| 条件 | 折扣 |
|------|------|
| 月消费 ≥ ¥1,000 | 9.5 折 |
| 月消费 ≥ ¥5,000 | 9 折 |
| 月消费 ≥ ¥20,000 | 8.5 折 |
| 预充值 ≥ ¥10,000 | 额外赠送 5% |
| 年付合同 | 额外赠送 10% |

### 3. 竞品对比

3cloud vs 官方直连 vs 其他聚合平台：

| 对比维度 | 3cloud | 官方直连 | 其他聚合平台 |
|---------|--------|---------|------------|
| 模型种类 | 50+ | 单一厂商 | 10-30 |
| 价格 | 批发折扣价 | 官方原价 | 市场价 |
| 多模型切换 | 一键切换 | 需多个账户 | 有限切换 |
| 技术支撑 | 7×24 小时 | 邮件工单 | 工作时间 |
| 统一账单 | ✅ 月度合并 | ❌ 分厂商 | ✅ 月度合并 |
| 中文优化 | ✅ 优先 | 部分支持 | 部分支持 |
| 定制化 | ✅ API 定制路由 | ❌ | ❌ |
| 合规保障 | ✅ 国内合规 | ❌ 跨境风险 | 部分 |

### 4. 常见问答

客户常问问题及标准应答，分类管理：

| 分类 | 典型问题 |
|------|---------|
| 产品类 | "你们支持哪些模型？"、"API 怎么接入？" |
| 价格类 | "怎么收费的？"、"有套餐吗？"、"比官网便宜多少？" |
| 技术类 | "支持流式输出吗？"、"速率限制是多少？" |
| 账号类 | "怎么注册？"、"余额不足了怎么办？" |
| 售后类 | "出问题了找谁？"、"技术支持怎么联系？" |

每篇 FAQ 包含：
- **问题标题**
- **标准应答**（支持 Markdown 格式，含链接/表格）
- **应答要点**：3-5 个关键点（供业务员脱稿使用）
- **相关文章**：关联的产品速查/定价/案例

### 5. 案例库

成功客户案例，按行业分类：

| 字段 | 说明 |
|------|------|
| 案例名称 | 如"XX 电商智能客服实践" |
| 行业 | 电商/金融/教育/医疗/游戏/内容 |
| 客户规模 | 小型 / 中型 / 大型 |
| 使用场景 | 描述客户使用场景 |
| 解决方案 | 3cloud 提供的方案 |
| 使用效果 | 量化数据（调用量、成本节约、效率提升）|
| 客户评价 | 客户原话引用 |
| 相关模型 | 使用了哪些模型 |

### 6. 全文搜索

支持对所有知识库内容进行全文搜索：

| 功能 | 说明 |
|------|------|
| 搜索范围 | 标题 + 内容 + 标签 |
| 匹配方式 | PostgreSQL 全文检索（tsvector） |
| 结果排序 | 标题匹配 > 标签匹配 > 内容匹配 |
| 分页 | 默认 20 条/页 |
| 高亮 | 搜索关键词在结果中高亮显示 |

---

## 数据表定义

### salesKnowledgeBase（销售知识库）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| category | enum | 分类：`product` / `pricing` / `competitor` / `faq` / `case` |
| title | varchar(200) | 标题 |
| content | text | Markdown 正文 |
| tags | jsonb | 标签数组，如 ["deepseek", "大模型", "入门"] |
| sortOrder | integer | 排序序号 |
| isPublished | boolean | 是否发布（草稿不展示给业务员）|
| createdBy | integer | 创建人 |
| createdAt | timestamp | 创建时间 |
| updatedAt | timestamp | 更新时间 |

---

## API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `POST` | `/api/v1/admin/sales-knowledge` | 创建知识文章 | 管理员 |
| `GET` | `/api/v1/admin/sales-knowledge` | 知识列表（含草稿）| 管理员 |
| `PATCH` | `/api/v1/admin/sales-knowledge/:id` | 更新知识文章 | 管理员 |
| `GET` | `/api/v1/agent/sales-knowledge` | 业务员查阅（仅已发布）| 业务员 |
| `GET` | `/api/v1/agent/sales-knowledge/search?q=` | 全文搜索 | 业务员 |

---

## 前端组件 Props

```tsx
// 知识库分类导航
interface KnowledgeCategoryNavProps {
  categories: { key: string; label: string; icon: ReactNode; count: number }[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

// 文章列表
interface KnowledgeArticleListProps {
  articles: ArticleSummary[];
  onArticleClick: (id: number) => void;
  loading: boolean;
}

// 文章详情
interface KnowledgeArticleDetailProps {
  article: ArticleDetail;
  onBack: () => void;
  relatedArticles?: ArticleSummary[];
}

interface ArticleDetail {
  id: number;
  title: string;
  content: string; // Markdown
  category: string;
  tags: string[];
  updatedAt: string;
}

// 搜索
interface KnowledgeSearchProps {
  onSearch: (query: string) => void;
  results: ArticleSummary[];
  query: string;
  loading: boolean;
}

// 管理员-文章编辑
interface KnowledgeEditorProps {
  mode: 'create' | 'edit';
  initialData?: Partial<ArticleInput>;
  categories: { key: string; label: string }[];
  onSave: (data: ArticleInput) => void;
  onPublish: (data: ArticleInput) => void;
}

interface ArticleInput {
  title: string;
  category: string;
  content: string;
  tags: string[];
  sortOrder: number;
  isPublished: boolean;
}

// 定价速查表
interface PricingQuickRefProps {
  models: PricingItem[];
}

interface PricingItem {
  modelName: string;
  inputPrice: number;
  outputPrice: number;
  unit: string; // "百万 Token"
}

// 竞品对比表
interface CompetitorComparisonProps {
  data: ComparisonRow[];
}

interface ComparisonRow {
  dimension: string;
  "3cloud": string;
  official: string;
  other: string;
}

// 案例卡片
interface CaseCardProps {
  case: CaseItem;
  onView: (id: number) => void;
}

interface CaseItem {
  id: number;
  title: string;
  industry: string;
  summary: string;
  effect: string;
}
```

---

## 边界条件

| 场景 | 处理方式 |
|------|---------|
| 搜索无结果 | 显示"未找到相关文章"，建议更换关键词或浏览全部分类 |
| 文章未发布（isPublished=false）| 业务员端不可见；管理员端显示"未发布"标签 |
| 分类下无文章 | 显示"该分类暂无文章" |
| 内容含复杂 Markdown | 前端渲染 Markdown 并支持代码高亮/表格/图片 |
| 搜索关键词过短（<2 字符）| 不触发搜索，提示"请输入至少 2 个字符" |
| 多标签匹配 | 标签 OR 匹配，优先展示命中标签更多的结果 |
| 文章数量超过 200 篇 | 分页加载，默认每页 20 篇 |

---

## 关联模块

| 模块 | 关联方式 |
|------|---------|
| §10.2 客服知识库 | 复用 Markdown 编辑器组件 |
| §4.5 营销内容 | 产品速查和案例库内容可与营销内容联动 |
| §4.3 供应商模型 | 产品速查定价数据源 |
| §4.8 系统配置 | 定价速查与系统定价配置同步 |
| §11.6 报价 | 业务员在创建报价时可参考知识库定价数据 |

---

### [?] 页面帮助
**页面名称**：销售知识库
**核心操作**：按分类浏览 → 搜索关键词 → 查看产品速查/定价/竞品/FAQ/案例
**注意事项**：定价数据为参考价，以系统实际配置为准；未发布的文章仅管理员可见；业务员不可创建/编辑知识库内容

### [?] 按钮级帮助对照表
| 按钮/操作 | 帮助说明 |
|----------|---------|
| 搜索 | 对标题、内容、标签进行全文检索，关键词高亮显示 |
| 分类切换 | 按产品速查/定价指南/竞品对比/FAQ/案例分类筛选 |
| 查看详情 | 查看完整的 Markdown 文章内容 |
| 新建文章（管理员）| 创建新的知识库文章，可选择是否立即发布 |
| 编辑（管理员）| 修改已存在的文章内容、分类、排序 |
| 发布/下架（管理员）| 控制文章对业务员的可见性 |