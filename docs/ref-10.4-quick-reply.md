# 深化参考：§10.4 快捷回复模板

> **对应**：[`PRD-客服支撑模块.md`](PRD-客服支撑模块.md) §10.4
> **关联**：[`ref-10.1-support-workbench.md`](ref-10.1-support-workbench.md)、[`SPEC-§26-工单系统.md`](SPEC-§26-工单系统.md)
> **优先级**：P0 | **状态**：需求文档（待开发）
> **最后更新**：2026-07-30

---

## 概述

客服日常回复内容中有大量重复：余额不足指导、兑换码使用、API Key 配置等。每次手动打字不仅慢，而且不同客服回复质量和格式不统一。快捷回复模板让客服一键插入标准化回复内容。

**核心价值**：回复效率提升 50%+，回复质量标准化，新客服快速上手。

---

## 功能模块

### 1. 模板分类

| 预置分类 | 说明 |
|---------|------|
| 余额相关 | 余额不足、充值指导、到账时间、对公转账 |
| API Key | 创建、配置、安全、过期处理 |
| 兑换码 | 使用教程、未到账、过期 |
| 发票 | 申请流程、抬头设置、开票规则 |
| 计费 | 价格说明、扣费规则、账单查看 |
| 账号 | 密码重置、登录问题、2FA |
| 代理 | 代理开通、佣金、升级 |
| 通用 | 问候语、结束语、延时回复 |

### 2. 模板内容

模板支持 Markdown 格式，含变量插值。

**变量占位符**（自动替换为用户真实数据）：

| 占位符 | 替换内容 | 示例 |
|--------|---------|------|
| `{user_name}` | 用户名 | 张三 |
| `{balance}` | 当前余额 | ¥500.00 |
| `{udid}` | 用户 ID | 42 |
| `{ticket_id}` | 当前工单编号 | TKT-20260728-0012 |
| `{current_date}` | 当前日期 | 2026-07-30 |
| `{support_email}` | 客服邮箱 | support@3cloud.com |

**模板示例**：

```
您好 {user_name}，

关于余额不足的问题，当前您的余额为 {balance}。
充值方式说明：
1. 支付宝/微信：登录后点击"充值"，即时到账
2. 对公转账：联系客服 {support_email} 获取对公账户信息
3. 兑换码：输入兑换码即可获得余额

如有疑问，请随时联系我们。
```

### 3. 模板管理

| 层级 | 创建人 | 可见范围 | 可编辑人 |
|------|--------|---------|---------|
| 个人模板 | 客服本人 | 仅自己 | 本人 |
| 团队模板 | 客服组长/主管 | 所属客服团队 | 组长+主管 |
| 全局模板 | 客服主管/管理员 | 全部客服 | 主管+管理员 |

**操作**：

| 操作 | 个人模板 | 团队模板 | 全局模板 |
|------|---------|---------|---------|
| 创建 | ✅ | ✅ | ✅（主管）|
| 编辑 | ✅ | ✅（组长+主管）| ✅（主管）|
| 删除 | ✅ | ✅（组长+主管）| ✅（主管）|
| 复制 | ✅（复制到个人库）| ✅（复制到个人库）| ✅（复制到个人库）|
| 排序 | ✅ | ✅ | ✅ |
| 分类管理 | ✅ | ✅ | ✅ |

### 4. 模板插入

客服在回复工单或在线对话时，通过快捷键或点击插入模板：

```
回复编辑框

┌─────────────────────────────────────────────────────────┐
│  您好 xxx，                                             │
│                                                          │
│  [插入模板 ▼]  [B] [I] [链接] [图片]                    │
│  ┌────────────────────────────────────────────────┐  │
│  │ 🔍 搜索模板...                                 │  │
│  ├────────────────────────────────────────────────┤  │
│  │ 📁 余额相关                                    │  │
│  │   ├ 余额不足标准回复                           │  │
│  │   ├ 充值到账时间说明                           │  │
│  │   └ 对公转账指导                               │  │
│  │ 📁 API Key                                    │  │
│  │   ├ 如何创建 API Key                           │  │
│  │   ├ 安全配置建议                               │  │
│  │   └ Key 过期处理                               │  │
│  │ ⭐ 常用（最近 5 条）                            │  │
│  └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**快捷键**：`Ctrl+Shift+T` 调出模板选择面板，`↑/↓` 选择，`Enter` 插入。

### 5. 常用模板（智能推荐）

自动统计客服使用频率，Top 5 模板展示在"常用"分组：

- 使用频次按周统计，周一凌晨重置
- 全局/团队/个人模板混排显示
- 管理员可手动置顶特定模板（强制高优先级）

### 6. 模板搜索

支持按模板标题、内容、分类搜索。搜索结果按匹配度排序。

---

## 数据表 Schema

```typescript
// quick_reply_templates — 快捷回复模板
export const quickReplyTemplates = pgTable("quick_reply_templates", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 100 }).notNull(),
  content: text("content").notNull(),                    // Markdown 内容
  categoryId: integer("category_id").references(() => qrtCategories.id),
  scope: varchar("scope", { length: 20 }).notNull(),     // personal | team | global
  ownerId: integer("owner_id").references(() => users.id),   // 创建者
  teamId: integer("team_id"),                             // 所属团队（scope=team 时必填）
  isPinned: boolean("is_pinned").default(false),          // 管理员置顶
  useCount: integer("use_count").default(0),              // 使用次数
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// qrt_categories — 快捷回复分类
export const qrtCategories = pgTable("qrt_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  icon: varchar("icon", { length: 20 }),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

---

## API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/admin/support/templates` | 模板列表（含个人/团队/全局） | 客服专员以上 |
| `POST` | `/api/v1/admin/support/templates` | 创建模板 | 客服专员以上 |
| `PATCH` | `/api/v1/admin/support/templates/:id` | 编辑模板 | 按 scope 权限 |
| `DELETE` | `/api/v1/admin/support/templates/:id` | 删除模板 | 按 scope 权限 |
| `PATCH` | `/api/v1/admin/support/templates/:id/pin` | 置顶/取消置顶 | 客服主管以上 |
| `POST` | `/api/v1/admin/support/templates/:id/copy` | 复制模板到个人库 | 客服专员以上 |
| `GET` | `/api/v1/admin/support/templates/categories` | 分类列表 | 客服专员以上 |
| `POST` | `/api/v1/admin/support/templates/categories` | 创建分类 | 客服组长以上 |
| `PATCH` | `/api/v1/admin/support/templates/categories/:id` | 编辑分类 | 客服组长以上 |
| `DELETE` | `/api/v1/admin/support/templates/categories/:id` | 删除分类（空分类） | 客服组长以上 |
| `GET` | `/api/v1/admin/support/templates/search?q=` | 搜索模板 | 客服专员以上 |
| `POST` | `/api/v1/admin/support/templates/:id/use` | 记录模板使用（前端埋点） | 客服专员以上 |
| `GET` | `/api/v1/admin/support/templates/frequent` | 常用模板 Top 5 | 客服专员以上 |

---

## 前端组件 Props

```tsx
// 快捷回复模板管理页
interface QuickReplyManagerProps {
  templates: QRTemplate[];
  categories: QRCategory[];
  scope: 'personal' | 'team' | 'global';
  onScopeChange: (scope: string) => void;
  onCreate: () => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onCopy: (id: number) => void;
  onPin: (id: number, pinned: boolean) => void;
  onReorder: (id: number, direction: 'up' | 'down') => void;
  loading: boolean;
}

// 模板编辑器
interface QRTemplateEditorProps {
  template?: QRTemplate;
  categories: QRCategory[];
  onSave: (data: Partial<QRTemplate>) => Promise<void>;
  onCancel: () => void;
}

// 模板插入面板（工单/对话中使用）
interface QuickReplyPanelProps {
  templates: QRTemplate[];
  categories: QRCategory[];
  frequent: QRTemplate[];
  onInsert: (content: string) => void;
  onClose: () => void;
  searchQuery: string;
  onSearch: (q: string) => void;
}
```

---

## 边界条件

| 场景 | 处理方式 |
|------|---------|
| 模板内容含无效变量 | 预览时高亮未定义变量 `{xxx}`，提示"变量 xxx 无法自动替换" |
| 删除分类时分类下有模板 | 不允许删除，提示"该分类下有 N 个模板，请先转移" |
| 客服复制全局模板后修改 | 复制后变为个人模板的独立副本，不影响原文 |
| 模板内容超过长度 | 提示"模板内容不超过 5000 字符" |
| 搜索无结果 | 显示空状态提示 + "可尝试其他关键词" |
| 变量插入后用户实际值不存在 | 显示 `{变量名}` 原样占位符（如用户未登录场景） |

---

## 验收标准

1. 客服可在工单回复框/对话中输入快捷键调出模板选择面板
2. 搜索模板按标题/内容匹配正常
3. 选择模板后内容插入编辑框，变量自动替换为用户实际数据
4. 个人/团队/全局三级模板管理权限正确
5. 模板编辑/删除/复制/排序功能正常
6. 常用模板自动统计 Top 5
7. 全局模板置顶操作仅主管可用

---

## 关联模块

| 模块 | 关联方式 |
|------|---------|
| §10.1 客服工作台 | 回复编辑器集成模板插入功能 |
| §10.2 知识库 | 模板用于快速回复，知识库用于深度引用，两者互补 |
| §26 工单系统 | 工单回复编辑器中集成本模块模板面板 |
| §27 在线客服 | 实时对话工具栏集成本模块 |

---

### [?] 页面帮助
**页面名称**：快捷回复模板
**核心操作**：管理个人/团队/全局的快捷回复模板，设置分类，快捷键插入使用
**注意事项**：个人模板仅自己可见；团队模板由组长管理；全局模板由主管统一维护；模板内容中可使用 `{user_name}` 等变量

### [?] 按钮级帮助对照表
| 按钮/操作 | 帮助说明 |
|----------|---------|
| 新建模板 | 创建新的快捷回复模板，支持 Markdown 内容和变量占位符 |
| 编辑模板 | 修改模板标题/内容/分类 |
| 复制到个人 | 将团队或全局模板复制到自己的个人模板库 |
| 置顶 | 将模板固定在常用列表顶部（仅主管可用）|
| 使用快捷键 | 在回复编辑框中按 Ctrl+Shift+T 快速调出模板面板 |
