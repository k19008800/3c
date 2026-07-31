# 功能说明书：§26 工单系统

> **对应文档**：[`PRD-客服支撑模块.md`]
> **状态**：草案（仅需求文档）
> **优先级**：P0

---


> **📖 页面功能说明帮助**
>
> **页面用途**：工单系统 功能说明书。本文档详细定义了该模块各功能点的字段规格、校验规则、边界条件、交互方式和注意事项。
>
> **适用角色**：客服、用户、管理员
>
> **核心操作**：
- 创建和管理工单
- 查看工单流转和处理流程
- 管理工单模板和自动分配规则
>
> **注意事项**：本 SPEC 文档面向开发者和测试人员，包含字段级定义和校验规则。页面标题旁的 `[?]` 帮助气泡引用本文档内容，点击可查看当前页面功能说明。
>
> **关联组件**：页面标题右侧 `[?]` 帮助按钮，悬停/点击弹出帮助弹窗。



## 26.0 总览

### 功能描述

工单系统是客服体系的基石。用户通过提交工单反馈问题并获得跟踪处理，客服通过工单队列统一管理所有用户反馈。支持分类、优先级、分配、标签、搜索、统计、满意度评价全生命周期管理。

### 子模块清单

| 编号 | 模块 | 优先级 | 核心价值 |
|------|------|--------|---------|
| 26.1 | 用户端工单创建与查看 | P0 | 用户可提交问题并跟踪进度 |
| 26.2 | 客服端工单队列 | P0 | 客服统一处理所有工单 |
| 26.3 | 工单处理流程 | P0 | 完整的工单生命周期（待处理→处理中→已解决→关闭） |
| 26.4 | 工单分配与流转 | P1 | 按客服忙闲/技能自动或手动分配 |
| 26.5 | 工单搜索与筛选 | P0 | 快速定位工单 |
| 26.6 | 工单统计 | P1 | 客服团队效能量化 |
| 26.7 | 满意度评价 | P1 | 工单关闭后用户评价服务质量 |

---

## 26.1 用户端工单创建与查看

### 功能描述

用户在控制台内提交工单、查看历史工单、跟踪处理进度、回复客服留言。替代当前仅靠邮件沟通的方式。

### 完成能力 / 展示效果

**工单列表页（`/console/tickets`）：**

```
我的工单
  [创建工单]

  工单#20260728-001  计费问题    [待处理]   2026-07-28  查看详情→
  工单#20260725-002  API 调用    [已解决]   2026-07-25  查看详情→
  工单#20260720-003  账户问题    [已关闭]   2026-07-20  查看详情→

  共 3 条 ｜ 第 1/1 页
```

**创建工单页：**

```
创建工单
  标题:       [________________________]
  分类:       [计费问题 ▼]
                 - 计费问题
                 - API 调用
                 - 账户与安全
                 - Key 管理
                 - 发票与退款
                 - 功能建议
                 - 其他
  优先级:     [普通 ▼]（紧急问题请在标题标注）
  描述:       [________________________]
  截图:       [选择文件]（可选，最多 3 张，单张 ≤ 5MB）

  [提交工单]
```

**工单详情页（`/console/tickets/:id`）：**

```
工单 #20260728-001

  状态: ⏳ 待处理
  分类: 计费问题
  优先级: 普通
  创建时间: 2026-07-28 14:23

  用户: 我
  我充值了 ¥100 但余额只增加了 ¥50，麻烦核实一下。
  [截图: recharge_record.png]

  ─────────────────────────────────

  [回复框...]  [发送]

  （工单关闭前可随时补充信息）
```

**工单详情（客服已回复后）：**

```
  客服 张三（2026-07-28 15:10）:
  您好，已核实您的充值记录。您 2026-07-28 14:20 的 ¥100 充值中，
  其中 ¥50 为活动返利，充值后即时到账余额；¥50 为赠送额度，
  按规则分 5 天释放（每日 ¥10），当前已释放 ¥10。
  所以余额显示 ¥60（充值 ¥50 + 已释放 ¥10）。

  用户 我（2026-07-28 15:15）:
  明白了，谢谢解释！
  ─────────────────────────────────
  客服 张三已将工单标记为 [已解决]
```

### 数据表结构

```typescript
// tickets — 工单主表
export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  ticketNo: varchar("ticket_no", { length: 30 }).notNull().unique(),  // 如 TS20260728-0001
  userId: integer("user_id").notNull().references(() => users.id),
  title: varchar("title", { length: 200 }).notNull(),
  category: varchar("category", { length: 30 }).notNull(),
    // 'billing' | 'api' | 'account' | 'key' | 'invoice_refund' | 'feature_request' | 'other'
  priority: varchar("priority", { length: 20 }).default("normal"),
    // 'low' | 'normal' | 'high' | 'urgent'
  status: varchar("status", { length: 20 }).default("pending"),
    // 'pending' | 'processing' | 'resolved' | 'closed'
  description: text("description").notNull(),
  attachments: text("attachments"),  // JSON array of file URLs
  assigneeId: integer("assignee_id").references(() => users.id),
  tags: text("tags"),  // 逗号分隔
  source: varchar("source", { length: 20 }).default("user"),  // 'user' | 'chat_transfer' | 'system'
  firstResponseAt: timestamp("first_response_at"),
  resolvedAt: timestamp("resolved_at"),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ticket_replies — 工单回复
export const ticketReplies = pgTable("ticket_replies", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => tickets.id),
  userId: integer("user_id").notNull().references(() => users.id),
  isStaff: boolean("is_staff").default(false),
  content: text("content").notNull(),
  attachments: text("attachments"),  // JSON array
  createdAt: timestamp("created_at").defaultNow(),
});

// ticket_tags — 工单标签（预定义）
export const ticketTagDefs = pgTable("ticket_tag_defs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  color: varchar("color", { length: 20 }).default("#6366f1"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ticket_satisfaction — 满意度评价
export const ticketSatisfaction = pgTable("ticket_satisfaction", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().unique().references(() => tickets.id),
  rating: integer("rating").notNull(),  // 1-5
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ticket_operation_logs — 工单操作日志
export const ticketOperationLogs = pgTable("ticket_operation_logs", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => tickets.id),
  operatorId: integer("operator_id").references(() => users.id),
  action: varchar("action", { length: 50 }).notNull(),
    // assigned / status_changed / priority_changed / tag_added / tag_removed / note_added
  detail: text("detail"),
  createdAt: timestamp("created_at").defaultNow(),
});
```

### API 接口

```
// 用户端
GET    /api/v1/me/tickets                    — 我的工单列表
POST   /api/v1/me/tickets                    — 创建工单
GET    /api/v1/me/tickets/:id                — 工单详情
POST   /api/v1/me/tickets/:id/reply          — 回复工单
POST   /api/v1/me/tickets/:id/close          — 用户自行关闭
POST   /api/v1/me/tickets/:id/satisfaction   — 提交满意度评价
POST   /api/v1/me/tickets/upload             — 上传附件

// 客服端（管理后台）
GET    /api/v1/admin/tickets                 — 工单队列（支持 status/priority/category/assignee/search 筛选）
GET    /api/v1/admin/tickets/:id             — 工单详情（含完整回复+操作日志）
POST   /api/v1/admin/tickets/:id/reply       — 回复工单
POST   /api/v1/admin/tickets/:id/assign      — 分配工单
POST   /api/v1/admin/tickets/:id/status      — 变更状态
POST   /api/v1/admin/tickets/:id/priority    — 变更优先级
POST   /api/v1/admin/tickets/:id/tags        — 添加/移除标签
POST   /api/v1/admin/tickets/:id/note        — 添加内部备注（用户不可见）
GET    /api/v1/admin/tickets/stats           — 工单统计
GET    /api/v1/admin/tickets/export          — 导出工单列表
```

### 前端组件

```tsx
// 用户端
<UserTicketList tickets: Ticket[] onPageChange: (page) => void totalPages: number />

<CreateTicketForm
  categories: { value: string; label: string }[]
  onSubmit: (data: TicketFormData) => Promise<void>
  onUpload: (file: File) => Promise<string>
  loading: boolean
/>

<TicketDetail
  ticket: Ticket
  replies: TicketReply[]
  onReply: (content: string) => Promise<void>
  onClose: () => Promise<void>
  userCanClose: boolean           // 仅待处理/处理中状态允许用户关闭
/>

<TicketSatisfaction
  ticketId: number
  onSubmit: (rating: number, comment?: string) => Promise<void>
/>

// 客服端
<AdminTicketQueue
  tickets: AdminTicket[]
  filters: TicketFilters
  onFilterChange: (filters: TicketFilters) => void
  onTicketClick: (id: number) => void
  onAssign: (id: number, assigneeId: number) => void
  loading: boolean
  stats: TicketStats           // 各状态数量
  kanbanView: boolean          // 是否 Kanban 视图
/>

<AdminTicketDetail
  ticket: AdminTicketDetail
  replies: TicketReply[]
  assignees: StaffUser[]
  tags: TicketTag[]
  onReply: (content: string, useTemplate?: string) => Promise<void>
  onStatusChange: (status: string) => Promise<void>
  onAssign: (assigneeId: number) => Promise<void>
  onPriorityChange: (priority: string) => Promise<void>
  onAddTag: (tagId: number) => Promise<void>
  onRemoveTag: (tagId: number) => Promise<void>
  onAddNote: (note: string) => Promise<void>
/>

<TicketStatsPanel
  stats: {
    pending: number
    processing: number
    resolved: number
    closed: number
    avgResponseTime: string   // 如 "2h 35m"
    avgResolveTime: string
    satisfaction: number      // 平均满意度 1-5
  }
/>

interface Ticket {
  id: number
  ticketNo: string
  title: string
  category: string
  priority: string
  status: string
  tags: string[]
  createdAt: string
  lastReplyAt?: string
  unreadCount?: number        // 用户端未读回复数
}

interface TicketReply {
  id: number
  userId: number
  isStaff: boolean
  content: string
  attachments: string[]
  createdAt: string
}

interface TicketFilters {
  status?: string
  priority?: string
  category?: string
  assigneeId?: number
  search?: string              // 搜索工单号/标题
  dateRange?: [string, string]
}
```

### 上下游关系

```
工单系统:
  ├── 用户端: TicketList / TicketDetail / CreateTicketForm / Satisfaction
  ├── 客服端: AdminTicketQueue / AdminTicketDetail / TicketStatsPanel
  ├── 后端: 用户端 API + 客服端 API + 自动编号生成
  ├── 数据库: tickets + ticket_replies + ticket_satisfaction + ticket_operation_logs + ticket_tag_defs（新增）
  ├── 通知: 客服被分配工单 → 站内通知；用户工单有回复 → 站内通知 + 邮件
  └── 关联: 支持从在线聊天转移为工单（source='chat_transfer'）
```

### 边界条件

| 场景 | 处理方式 |
|------|---------|
| 用户重复提交相同内容 | 后端 5 分钟内同一用户+标题相似度>90% → 提示"您已提交过相似工单" |
| 用户提交工单后立即发现说错了 | 允许用户自行关闭（仅待处理状态），关闭后重新开 |
| 客服回复后用户 7 天未再回复 | 自动标记为"已解决"并通知用户"如还有问题请重新开单" |
| 附件的文件格式限制 | 仅允许 jpg/png/gif/pdf，单张 ≤5MB，最多 3 张 |
| 工单创建后 24 小时无客服响应 | 自动提升优先级为 high，通知客服主管 |
| 用户删除账号 | 工单保留（显示"已注销用户"），不删除历史记录 |
| 工单号格式 | TS + 日期 + 4 位序号，如 TS20260728-0001 |
| 用户未登录时想提交工单 | 引导注册/登录 → 自动跳回创建页面 |

### 验收标准

#### □ 流程图一致性校验 — 与对应流程图对比验证流程分支、异常处理、决策节点完全一致

1. 用户创建工单 → 选择分类、填写描述、上传截图 → 提交 → 显示工单号
2. 用户在我的工单列表看到已提交的工单 → 点击查看详情
3. 客服在管理后台看到待处理的工单队列 → 点击进入详情
4. 客服回复工单 → 用户端显示客服回复
5. 客服标记已解决 → 用户端状态更新 → 触发满意度评价
6. 用户提交满意度评价 → 客服端看到评价结果
7. 工单搜索支持按工单号/标题/用户名模糊搜索

---

## 26.2 客服端工单队列

### 功能描述

客服在管理后台查看所有工单的统一队列，支持按状态分列查看（Kanban 视图）或列表视图，快速了解当前工作负荷。

### 完成能力 / 展示效果

**管理后台 → 客服 → 工单管理：**

```
工单管理              [列表视图] [看板视图]  [导出]

  全部(23)  待处理(8)  处理中(6)  已解决(5)  已关闭(4)

  待处理（8）：
  ┌─────────────────────────────────────────────┐
  │ TS20260728-001  计费问题         🟡 高   2h │
  │ TS20260728-002  API 调用         🟢 普   4h │
  │ TS20260727-015  Key 管理         🟢 普   1d │
  │ ...                                       │
  └─────────────────────────────────────────────┘

  处理中（6）：
  ┌─────────────────────────────────────────────┐
  │ TS20260727-012  账户问题  👤 张三   1h     │
  │ TS20260727-010  发票问题  👤 李四   3h     │
  └─────────────────────────────────────────────┘
           ↑ 每个卡片显示: 工单号 / 标题 / 优先级 / 等待时间

  筛选: [全部分类 ▼] [优先级 ▼] [客服 ▼] [搜索工单号/用户名...]
```

### 后端实现

```typescript
// 工单队列 API 返回客户端所需的所有筛选和分页数据
GET /api/v1/admin/tickets
  查询参数: { status, priority, category, assigneeId, search, page, limit, sort }
  响应: {
    tickets: Ticket[],
    total: number,
    stats: { pending: 8, processing: 6, resolved: 5, closed: 4 },
    page: 1,
    totalPages: 5
  }
```

### 验收标准

1. 工单队列显示各状态的工单数量统计
2. Kanban 视图下拖拽工卡可变更状态（待处理→处理中等）
3. 筛选功能支持多条件组合查询
4. 搜索支持模糊匹配工单号和用户名

---

## 26.3 工单处理流程

### 功能描述

完整的工单生命周期管理和流转逻辑。

### 状态流转图

```
                       用户提交
                          │
                     ┌────▼────┐
          24h无响应  │  待处理   │  用户自行关闭
         ┌─────────►│ (pending) │◄────────────┐
         │          └────┬─────┘              │
     优先级提升            │ 客服接单            │
         │          ┌────▼──────┐              │
         │          │  处理中     │              │
         │          │ (processing)│             │
         │          └────┬───────┘             │
         │               │ 客服标记已解决        │
         │          ┌────▼──────┐              │
         │          │  已解决     │              │
         │          │ (resolved) │              │
         │          └────┬───────┘             │
         │               │ 用户确认或7天无回复    │
         │          ┌────▼──────┐              │
         └──────────┤  已关闭     │              │
                    │  (closed)  ├──────────────┘
                    └───────────┘
```

**各状态说明：**

| 状态 | 说明 | 操作权限 |
|------|------|---------|
| pending | 用户已提交，等待客服接单 | 客服可接单/分配/标记为垃圾工单 |
| processing | 客服正在处理中 | 客服可回复/标记解决/转其他客服 |
| resolved | 客服认为已解决，等待用户确认 | 用户可确认关闭/重新打开 |
| closed | 已关闭，不可再回复 | — |

**超时策略：**

```
├── 待处理超过 24 小时 → 自动提升为 high 优先级 + 通知主管
├── 待处理超过 48 小时 → 自动提升为 urgent 优先级 + 通知所有在线客服
├── 已解决超过 7 天未关闭 → 自动关闭
└── 用户回复后客服超过 24 小时未回复 → 通知客服主管
```

**客服快捷操作流程：**

```
客服打开工单详情 →
  ├── 在用户信息面板查看用户资料、余额、近期调用记录
  ├── 在回复框回复内容（支持插入知识库文章和快捷模板）
  ├── 添加内部备注（仅客服可见，用于记录处理思路）
  └── 操作:
      ├── [标记为处理中] → status='processing', 记录操作日志
      ├── [标记为已解决] → status='resolved', 记录 resolvedAt
      ├── [分配] → 选择其他客服
      ├── [转工单] → 如果分类不对，转到正确的部门
      └── [标记为垃圾] → 标记为 spam, 用户端不可见
```

### 验收标准

1. 新工单自动进入待处理队列
2. 客服接单 → 状态变为处理中 → 回复后标记解决
3. 用户收到已解决通知 → 确认关闭或重新打开
4. 24 小时无人接单 → 自动提示主管

---

## 26.4 工单分配与流转

### 功能描述

工单自动或手动分配给指定客服处理，支持按技能/忙闲分配，支持跨客服流转。

### 分配规则

```
自动分配（可配置开关）：
├── 轮询分配: 按当前待处理工单数最少的客服分配
├── 技能匹配: 根据工单分类匹配擅长该领域的客服
│   └── 计费类 → 财务客服优先
│   └── API 类 → 技术客服优先
└── 优先级插队: urgent 工单直接分配给当前空闲的客服

手动分配：
├── 客服主管可将工单分配给指定客服
├── 客服可将工单转给其他客服（需填写转单原因）
└── 客服可主动"抢单"（从待处理队列中自选）

部门/分组（可选）：
├── 一线客服: 处理常规问题
├── 二线技术: API/技术问题升级
└── 财务客服: 计费/发票/退款
```

### 验收标准

1. 新工单创建后自动分配给当前待处理最少的客服
2. 客服主管可手动将工单分配给指定客服
3. 客服可转单并填写原因

---

## 26.5 工单搜索与筛选

### 功能描述

客服快速定位工单，支持多维度组合搜索。

### 搜索维度

```
├── 文本搜索: 工单号 / 标题 / 用户名 / 邮箱 / 回复内容
├── 状态筛选: 待处理 / 处理中 / 已解决 / 已关闭
├── 优先级筛选: 低 / 普通 / 高 / 紧急
├── 分类筛选: 计费 / API / 账户 / Key / 发票 / 建议
├── 客服筛选: 按指定客服
├── 时间范围: 自定义开始结束日期
└── 标签筛选: 按标签筛选

附加: 保存常用筛选条件（如"只看我待处理的工单"）
```

### 验收标准

1. 按工单号搜索 → 精确匹配
2. 按用户名搜索 → 模糊匹配，显示该用户所有工单
3. 多条件组合筛选 → 结果正确
4. 保存筛选条件 → 下次打开时恢复

---

## 26.6 工单统计

### 功能描述

客服团队效能量化，支持查看日/周/月维度的工单处理统计。

### 完成能力 / 展示效果

```
工单统计 — 2026 年 7 月
  ┌────────────────────────────────────────────────┐
  │  总工单: 234     │  已解决: 198 (84.6%)         │
  │  平均响应: 2h15m │  平均解决: 8h30m             │
  │  满意度: 4.2/5.0 │  超时工单: 12 (5.1%)         │
  └────────────────────────────────────────────────┘

  工单分类分布:
  计费问题 ████████████ 40%
  API 调用 ██████████ 35%
  账户问题 ████ 12%
  Key 管理 ██ 8%
  其他     █ 5%

  客服排行:
  👤 张三  处理 82 单  满意度 4.5  平均响应 1h20m
  👤 李四  处理 65 单  满意度 4.3  平均响应 2h05m
  👤 王五  处理 51 单  满意度 3.9  平均响应 3h10m

  趋势（近 30 天）:
  [折线图: 日工单量]
  [折线图: 平均响应时间趋势]
```

### 统计指标

| 指标 | 计算方式 | 维度 |
|------|---------|------|
| 总工单数 | 周期内创建的工单总数 | 日/周/月 |
| 已解决率 | 已解决+已关闭 / 总数 | 日/周/月 |
| 平均响应时间 | 所有工单(首次回复时间 - 创建时间) 的平均值 | 日/周/月 |
| 平均解决时间 | 所有工单(解决时间 - 创建时间) 的平均值 | 日/周/月 |
| 满意度 | 所有满意度评分的平均值 | 日/周/月 |
| 超时率 | 超时工单数 / 总数 | 日/周/月 |
| 热门分类 | 各分类工单数占比 | 月 |
| 客服排名 | 各客服的处理量、满意度、响应时间 | 月 |

### 验收标准

1. 工单统计页显示核心指标（总工单/已解决率/响应时间/满意度）
2. 工单分类分布以饼图展示
3. 客服排行显示各客服的处理量和满意度
4. 趋势折线图按日展示

---

## 26.7 满意度评价

### 功能描述

工单关闭（已解决→用户确认）后，用户可对客服的服务进行评价。帮助管理者了解服务质量。

### 完成能力 / 展示效果

**工单解决后用户端弹窗：**

```
┌──────────────────────────────────────────────┐
│  工单 TS20260728-001 已解决                    │
│  请对本次服务进行评价                            │
│                                                │
│  非常不满意  ○ ○ ○ ○ ○  非常满意               │
│                                                │
│  补充意见（可选）：                              │
│  [________________________]                    │
│                                                │
│  [提交评价]   [跳过]                           │
└──────────────────────────────────────────────┘
```

**客服端看到统计：**
- 每个客服的满意度平均分
- 近期低分工单（≤3 分）高亮提醒
- 低分工单可查看原因用于改进

### 验收标准

1. 工单关闭后用户看到评价弹窗
2. 用户评分 + 可选意见 → 提交
3. 客服端可查看满意度统计和低分详情
4. 满意度数据纳入客服排行榜


---

### [?] 页面帮助

**页面名称**：工单系统

**适用角色**：用户、客服、管理员

**功能定位**：用户提交问题工单并跟踪处理进度，客服通过工单队列统一管理反馈，覆盖创建、分配、流转、搜索、统计、满意度评价全生命周期。

**子模块说明**：
- §26.1 用户端工单创建与查看：用户提交问题（选择分类/优先级/附件），跟踪处理进度
- §26.2 客服端工单队列：客服统一处理所有工单，支持列表/Kanban 视图
- §26.3 工单处理流程：完整的生命周期（待处理→处理中→已解决→关闭）
- §26.4 工单分配与流转：按客服忙闲/技能自动或手动分配，支持转派
- §26.5 工单搜索与筛选：按关键词/分类/状态/优先级/时间筛选定位工单
- §26.6 工单统计：客服团队处理量、响应时长、解决率等效能指标
- §26.7 满意度评价：工单关闭后用户评价服务质量（星级+评价）

**注意事项**：
- 工单关闭后如需重新打开，需客服操作并记录原因
- 满意度评价不可修改，评价后自动计入客服绩效
- 紧急工单（计费/服务中断/安全事件）会触发 SLA 倒计时和升级通知
- 工单分配支持技能匹配，无匹配客服时进入公共队列

**常见问题**：
Q: 工单提交后多久会被处理？
A: 根据工单优先级不同，紧急工单 15 分钟内首次响应，普通工单 1 小时内首次响应。

Q: 工单被关闭了还能继续追问吗？
A: 可以联系客服重新打开工单，或新建工单并引用原工单编号。

Q: 为什么我的工单被转派了？
A: 可能因为原客服不在线或工单需要其他技能组处理，转派会保留处理记录。

### [?] 按钮级帮助对照表

**§26.1 用户端工单**

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 新建工单 | 选择工单分类、填写标题和详细描述，可上传附件和截图 |
| 查看进度 | 查看工单当前状态和处理历史 |
| 追加回复 | 在工单中添加补充说明或追问 |
| 关闭工单 | 问题已解决时手动关闭工单 |

**§26.2 客服端工单队列**

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 领取工单 | 从公共队列领取一个工单到自己名下处理 |
| 开始处理 | 将工单状态从待处理变为处理中 |
| 标记解决 | 完成处理后标记工单为已解决 |
| 关闭工单 | 确认问题无后续后关闭工单 |
| 转派工单 | 将工单转给其他客服或技能组 |
| 添加标签 | 为工单添加分类标签便于后续统计 |

**§26.4 工单分配与流转**

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 自动分配 | 按客服忙闲度和技能匹配自动分配（可配置规则） |
| 手动分配 | 管理员手动指定客服处理 |
| 修改优先级 | 根据严重程度调整工单优先级（影响 SLA 倒计时） |

**§26.6 工单统计**

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 查看统计看板 | 工单量、处理时长、解决率、满意度等指标看板 |
| 导出报表 | 导出指定时间段的工单统计报表（CSV） |

**§26.7 满意度评价**

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 提交评价 | 工单关闭后填写星级评价和文字反馈 |
| 查看评价详情 | 查看历史工单的评价内容和评分 |
