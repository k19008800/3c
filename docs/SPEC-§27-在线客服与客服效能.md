# 功能说明书：§27 在线客服与客服效能增强

> **对应文档**：[`PRD-客服支撑模块.md`]
> **状态**：草案（仅需求文档）
> **优先级**：P0（在线客服）、P1（绩效统计、操作审计）

---


> **📖 页面功能说明帮助**
>
> **页面用途**：在线客服与客服效能 功能说明书。本文档详细定义了该模块各功能点的字段规格、校验规则、边界条件、交互方式和注意事项。
>
> **适用角色**：客服人员、管理员
>
> **核心操作**：
- 使用在线客服工作台
- 管理客服效能指标
- 配置自动回复和常见问题库
>
> **注意事项**：本 SPEC 文档面向开发者和测试人员，包含字段级定义和校验规则。页面标题旁的 `[?]` 帮助气泡引用本文档内容，点击可查看当前页面功能说明。
>
> **关联组件**：页面标题右侧 `[?]` 帮助按钮，悬停/点击弹出帮助弹窗。



## 27.0 总览

### 功能描述

在 §10.5 在线客服（WebChat）基础上大幅增强：排队机制、客服状态管理、自动分配、预设自动回复、消息已读/输入状态、快捷操作、聊天转工单、历史记录。同时补充客服绩效统计和客服操作审计体系。

### 子模块清单

| 编号 | 模块 | 优先级 | 核心价值 |
|------|------|--------|---------|
| 27.1 | 在线客服增强 | P0 | 从基础聊天升级为完整客服即时通讯系统 |
| 27.2 | 客服绩效统计 | P1 | 量化客服团队效率 |
| 27.3 | 客服操作审计 | P1 | 客服操作可追溯、可回滚 |

---

## 27.1 在线客服增强

### 功能描述

现有 §10.5 仅在用户端显示悬浮聊天按钮 + 客服可回复。需要补充完整的多客服排队、状态管理、自动分配、预设消息、已读回执、输入状态提示、快捷操作、聊天转工单等功能。

### 27.1.1 用户端体验

**Portal/控制台悬浮聊天按钮：**

```
┌──────────────────────────────────────────────┐
│  需要帮助？ 🤔                                 │
│  我们通常会在 5 分钟内回复                      │
│                                                │
│  1. 常见问题：                                  │
│  📌 如何创建 API Key                           │
│  📌 充值后未到账怎么办                          │
│  📌 API 调用一直失败                           │
│                                                │
│  2. 输入您的问题...                  [发送]    │
│                                                │
│  ──────────────────────────────────            │
│  客服繁忙？ [提交工单] 我们会在 2 小时内回复      │
└──────────────────────────────────────────────┘
```

**聊天中体验：**

```
┌──────────────────────────────────────────────┐
│  在线客服      [转工单] [关闭]                │
├──────────────────────────────────────────────┤
│                                                │
│  客服 张三 已接入             14:23            │
│                                                │
│  张三: 您好，请问有什么可以帮助您的？ 14:23    │
│                                                │
│  我: 我充值后余额没到账        14:24    ✓✓     │
│                                                │
│  张三: 让我帮您查一下...       14:24           │
│                                                │
│  张三: 正在查询您的充值记录... 14:25  ✏️输入中  │
│                                                │
│  张三: 已核实，¥100 已到账，请刷新页面查看      │
│                              14:26             │
│                                                │
│  我: 看到了，谢谢！             14:27    ✓✓     │
│                                                │
│  张三: 感谢您的耐心等待，还有其他问题吗？       │
│                              14:27             │
│  ── 会话已结束，感谢您的咨询 ──                 │
│  本次服务满意吗？ [😊满意] [😐一般] [😞不满意]  │
├──────────────────────────────────────────────┤
│  输入消息...                       [发送]     │
└──────────────────────────────────────────────┘
```

**排队中体验：**

```
┌──────────────────────────────────────────────┐
│  在线客服                                      │
├──────────────────────────────────────────────┤
│                                                │
│  ⏳ 您前面还有 2 位用户在等待                   │
│  预计等待时间: 3-5 分钟                          │
│  不想等待？可以先描述问题，客服空闲后回复您     │
│                                                │
│  [留言描述问题...]                  [发送]      │
│                                                │
│  或者 [提交工单]，我们会在 2 小时内回复          │
└──────────────────────────────────────────────┘
```

### 27.1.2 客服端体验

**管理后台 → 客服 → 在线客服：**

```
在线客服面板
  ┌─────────────────────────────────────────┐
  │  在线: 3人   忙碌: 1人   离线: 2人      │
  │  [在线] [忙碌] [离线 — 不接新会话]      │
  ├─────────────────────────────────────────┤
  │  等待中 (3) ─── 正在服务 (4) ───       │
  │                                      │
  │  👤 用户A (2min) 计费问题            │  ┌─────────────────────────┐
  │  👤 用户B (5min) API 调用            │  │ 聊天窗口 — 用户A        │
  │  👤 用户C (8min) 账户问题            │  │─────────────────────────│
  │                                      │  │ 用户: 我充值后余额...   │
  │  ────────────                        │  │ 客服: 已核实已到账     │
  │  切换客服状态:                        │  │                         │
  │  [🟢 在线]                            │  │ 快捷操作:               │
  │  [🟡 忙碌 (不接新)]                   │  │ [查看用户信息]          │
  │  [🔴 离线]                            │  │ [调整余额]              │
  │                                       │  │ [禁用/启用 Key]         │
  │  我的当前会话: 2                       │  │ [转工单]                │
  │                                       │  │                         │
  │  消息区:                               │  │ 模板: [快速回复 ▼]     │
  │  [输入...]                [发送]        │  │                         │
  └─────────────────────────────────────┘  └─────────────────────────┘
```

### 27.1.3 排队与分配机制

**分配规则：**

```
用户发起聊天 →
  ├── 检查是否有在线 + 非忙碌的客服
  │   ├── 有 → 按分配规则分配给最合适的客服
  │   └── 无 → 用户进入排队队列 + 显示预计等待时间
  │
  ├── 分配规则（优先级顺序）:
  │   1. 如果用户之前有聊天历史 → 优先分配给上次接待的客服
  │   2. 如果分类匹配 → 按客服技能标签匹配
  │   3. 否则 → 按当前会话数最少的客服分配（轮询）
  │
  └── 排队超时:
      ├── 排队 > 5 分钟 → 提示用户可转工单
      └── 排队 > 10 分钟 → 自动创建工单（source='chat_timeout'）
```

**客服状态说明：**

| 状态 | 说明 | 新会话分配 |
|------|------|-----------|
| 🟢 在线 | 可接新会话 | 正常分配 |
| 🟡 忙碌 | 正在处理中，不接新会话 | 跳过 |
| 🔴 离线 | 退出登录或手动离线 | 不分配 |

### 27.1.4 自动回复与预设消息

**客服离线自动回复：**

```
用户发起聊天时所有客服离线：
  └── 自动回复: "😊 您好，当前没有客服在线。
      已为您记录消息，客服上线后会第一时间回复您。
      或者您可以提交工单，我们将在 2 小时内处理。"

  └── 用户发送的消息 → 创建工单（source='chat_offline'）
```

**预设消息（管理后台配置）：**

```
预设消息列表（管理后台可维护）：
├── 欢迎语: "您好，欢迎来到 3Cloud 客服中心，请问有什么可以帮您？"
├── 等待提示: "请稍等，正在为您查询..."
├── 结束语: "感谢您的咨询，如果还有其他问题，欢迎随时联系我们！"
└── 离线提示: "..."

客服侧可用:
  聊天窗口 → [模板] → 选择预设消息 → 自动填入输入框
```

### 27.1.5 聊天转工单

```
客服在聊天窗口点击 [转工单] →
  弹窗：
    工单标题: [自动填入: "在线客服会话 - 用户邮箱"]
    分类: [按聊天内容自动选择 ▼]
    描述: [自动填入最近 10 条聊天记录]
    [确认创建]

  创建成功后:
  ├── 该聊天会话自动关闭
  ├── 用户端聊天窗口显示 "您的咨询已转工单 #TS20260728-001"
  └── 用户可点击查看工单详情
```

### 27.1.6 历史聊天记录

```
客服打开用户的聊天窗口时：
├── 右侧显示 "历史会话" 面板
├── 列出该用户最近 10 次聊天记录
├── 每次显示: 时间 / 时长 / 接待客服 / 聊天摘要（前 50 字）
└── 点击 → 展开完整聊天记录（只读）
```

### 27.1.7 技术方案

```
通信方案: WebSocket（复用现有 ws 路由）
├── 连接路径: /ws/chat
├── 消息协议: JSON 格式
├── 心跳: 每 30 秒发送 ping
└── 重连: 断线后自动重连，重连后拉取未读消息

消息类型：
├── user_message     — 用户发送消息
├── staff_message    — 客服发送消息
├── system_message   — 系统消息（客服接入/离开/转工单）
├── typing           — 正在输入
├── read_receipt     — 已读回执
└── status_change    — 客服状态变更
```

### 数据表结构

```typescript
// chat_sessions — 聊天会话
export const chatSessions = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  staffId: integer("staff_id").references(() => users.id),
  status: varchar("status", { length: 20 }).default("waiting"),
    // waiting / active / closed / transferred_to_ticket
  category: varchar("category", { length: 30 }),  // 自动识别或客服标记
  queuePosition: integer("queue_position"),
  waitingStartedAt: timestamp("waiting_started_at"),
  staffAssignedAt: timestamp("staff_assigned_at"),
  closedAt: timestamp("closed_at"),
  closedBy: varchar("closed_by", { length: 20 }),  // user / staff / system
  createdAt: timestamp("created_at").defaultNow(),
});

// chat_messages — 聊天消息
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => chatSessions.id),
  senderId: integer("sender_id").notNull().references(() => users.id),
  senderType: varchar("sender_type", { length: 10 }).notNull(),  // user / staff / system
  contentType: varchar("content_type", { length: 20 }).default("text"), // text / image / system
  content: text("content").notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// chat_presets — 预设消息
export const chatPresets = pgTable("chat_presets", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 20 }).notNull(),  // welcome / waiting / closing / offline / custom
  title: varchar("title", { length: 100 }),
  content: text("content").notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});
```

### API 接口

```
// 用户端
WS  /ws/chat                                    — WebSocket 聊天连接
POST /api/v1/me/chat/start                      — 发起聊天（进入排队或分配客服）
GET  /api/v1/me/chat/history                    — 历史聊天记录列表
GET  /api/v1/me/chat/sessions/:id/messages      — 某次聊天的完整消息
POST /api/v1/me/chat/feedback                   — 聊天结束后满意度评价

// 客服端（管理后台）
WS  /ws/chat/staff                              — 客服 WebSocket 连接（接收排队通知/会话分配）
GET  /api/v1/admin/chat/queue                   — 等待队列
GET  /api/v1/admin/chat/active                  — 正在服务的会话列表
GET  /api/v1/admin/chat/sessions/:id/messages   — 会话消息
POST /api/v1/admin/chat/sessions/:id/close      — 关闭会话
POST /api/v1/admin/chat/sessions/:id/transfer   — 转工单
POST /api/v1/admin/chat/status                  — 更新客服状态（online/busy/offline）
GET  /api/v1/admin/chat/staff-status            — 所有客服状态一览
GET  /api/v1/admin/chat/presets                 — 预设消息列表
POST /api/v1/admin/chat/presets                 — 创建预设消息
PUT  /api/v1/admin/chat/presets/:id             — 编辑预设消息
DELETE /api/v1/admin/chat/presets/:id           — 删除预设消息
```

### 前端组件

```tsx
// 用户端
<UserChatWidget
  user: { id: number; name: string; email: string }
  onTicketCreate: (ticketId: number) => void
/>

<UserChatBubble />    // Portal/控制台右下角悬浮气泡

// 客服端
<StaffChatPanel staffId: number />

<ChatQueue
  waitingSessions: QueuedSession[]
  activeSessions: ActiveSession[]
  onAccept: (sessionId: number) => void
  onTransferToTicket: (sessionId: number) => void
/>

<ChatWindow
  sessionId: number
  messages: ChatMessage[]
  userInfo: UserBrief
  onSend: (content: string) => void
  onClose: () => void
  presets: PresetMessage[]
  quickActions: QuickAction[]
/>

interface QueuedSession {
  sessionId: number
  userEmail: string
  waitingDuration: string
  category?: string
}

interface ActiveSession {
  sessionId: number
  userEmail: string
  lastMessage: string
  unreadCount: number
  duration: string
}

interface ChatMessage {
  id: number
  senderType: 'user' | 'staff' | 'system'
  contentType: 'text' | 'image' | 'system'
  content: string
  readAt?: string
  createdAt: string
}

interface QuickAction {
  label: string
  action: () => void
  icon?: string
}
```

### 边界条件

| 场景 | 处理方式 |
|------|---------|
| 用户发起聊天时所有客服离线 | 自动回复离线提示 → 用户发送的消息创建为工单 |
| 用户排队中关闭聊天窗口 | 队列位置保留 5 分钟，5 分钟内回来继续排队 |
| 客服同时被分配多个会话 | 客服最多同时服务 N 个会话（默认 3，可配置） |
| 用户发消息后客服 2 分钟未回复 | 自动提示用户"请稍等，客服正在处理中" |
| 用户发送敏感内容（手机号/密码） | 自动屏蔽显示（显示为 ****） |
| 聊天记录保存期限 | 最近 90 天，定期清理 |
| 同一个 IP 频繁发起聊天 | 每小时最多 5 次新会话 |

### 验收标准

#### □ 流程图一致性校验 — 与对应流程图对比验证流程分支、异常处理、决策节点完全一致

1. 用户点击聊天按钮 → 进入排队或直接分配客服
2. 排队时显示等待位置和预计时间
3. 客服在线 → 收到新会话通知 → 接入聊天
4. 消息已读回执和输入状态指示器正常工作
5. 客服可查看用户信息、调整余额、禁用 Key
6. 客服转工单 → 聊天自动关闭 → 生成关联工单
7. 聊天结束后用户看到满意度评价
8. 预设有消息和自动回复正常触发

---

## 27.2 客服绩效统计

### 功能描述

量化客服团队的工作效率和服务质量，按日/周/月统计展示，帮助管理者了解团队负荷和个体表现。

### 完成能力 / 展示效果

**管理后台 → 客服 → 绩效统计：**

```
客服绩效 — 2026 年 7 月
  ┌────────────────────────────────────────────────┐
  │  团队概览                                       │
  │  总工单处理: 234  │ 在线会话: 412               │
  │  平均响应: 2h15m  │ 平均会话时长: 8m30s         │
  │  满意度: 4.2/5.0  │ 超时工单: 12 (5.1%)         │
  └────────────────────────────────────────────────┘

  客服排名
  ┌─────┬────────┬────────┬────────┬────────┬──────┐
  │ 排名 │ 客服名 │ 工单数  │ 会话数  │ 满意度 │ 响应 │
  ├─────┼────────┼────────┼────────┼────────┼──────┤
  │ 🥇  │ 张三   │ 82     │ 156    │ 4.5    │ 1h20m│
  │ 🥈  │ 李四   │ 65     │ 128    │ 4.3    │ 2h05m│
  │ 🥉  │ 王五   │ 51     │ 98     │ 3.9    │ 3h10m│
  └─────┴────────┴────────┴────────┴────────┴──────┘

  趋势（近 30 天）
  [折线图: 日处理量]
  [折线图: 平均响应时间]
  [柱状图: 问题分类分布]
```

### 核心指标

| 指标 | 计算方式 | 数据源 |
|------|---------|--------|
| 工单处理量 | 客服参与回复的工单数 | tickets + ticket_replies |
| 在线会话数 | 客服参与的聊天会话数 | chat_sessions |
| 平均响应时间 | (首次回复时间 - 工单创建时间) 的平均值 | tickets.firstResponseAt |
| 平均会话时长 | (会话关闭时间 - 客服接入时间) 的平均值 | chat_sessions |
| 满意度 | 该客服收到评价的平均分 | ticket_satisfaction + chat_feedback |
| 超时率 | 超时工单数 / 总数 | tickets |
| 首次解决率 | 用户未重新打开就关闭的工单占比 | tickets |

### API 接口

```
GET /api/v1/admin/support/stats
  查询参数: { period: 'day' | 'week' | 'month', date: '2026-07' }
  响应: { teamOverview, staffRanking, trends, categoryDistribution }
```

### 验收标准

1. 绩效统计页显示团队概览指标
2. 客服排名按处理量和满意度排序
3. 趋势图展示近 30 天的数据变化
4. 可按日/周/月切换查看

---

## 27.3 客服操作审计

### 功能描述

客服对用户余额/Key/权限等敏感操作全部记录操作日志，支持操作回滚和敏感操作二次确认。

### 完成能力 / 展示效果

**客服操作记录（后台 → 客服 → 操作审计）：**

```
客服操作审计
  [筛选: 客服 ▼] [操作类型 ▼] [时间范围 ▼]

  时间              操作者    操作类型          目标用户     详情
  2026-07-28 10:23  张三      调整余额         用户A        +¥100.00
  2026-07-28 09:15  李四      禁用 Key         用户B        Key: sk-xxx
  2026-07-27 18:00  张三      解封用户         用户C        因误封解封
  2026-07-27 15:30  王五      调整余额         用户D        -¥50.00 (退款)
```

**操作回滚：**

```
每笔操作记录变更前后数据 →
├── 调整余额: 记录 before_balance, after_balance, diff
├── 回滚: 点击"回滚" → 自动将余额恢复到 before_balance
├── 记录回滚操作到操作日志（含回滚者和回滚时间）
└── 仅 24 小时内的操作允许回滚
```

**敏感操作二次确认：**

```
客服执行以下操作时弹出确认弹窗：
├── 调整余额（单次 > ¥100）
├── 禁用/启用用户
├── 删除 API Key
├── 解封被封禁用户
├── 修改用户角色

二次确认弹窗：
  ┌──────────────────────────────┐
  │  确认操作                      │
  │  您正在为用户 张三 调整余额     │
  │  变更: ¥50.00 → ¥150.00      │
  │                              │
  │  原因说明: [________________]  │
  │                              │
  │  必填：请输入操作原因          │
  │                              │
  │  [取消] [确认操作]             │
  └──────────────────────────────┘
```

### 数据表

```typescript
// staff_operation_logs — 客服操作日志
export const staffOperationLogs = pgTable("staff_operation_logs", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => users.id),
  operationType: varchar("operation_type", { length: 50 }).notNull(),
    // adjust_balance / disable_key / enable_key / ban_user / unban_user / change_role / ...
  targetUserId: integer("target_user_id").references(() => users.id),
  targetType: varchar("target_type", { length: 30 }),
  targetId: varchar("target_id", { length: 50 }),
  beforeValue: text("before_value"),   // JSON
  afterValue: text("after_value"),     // JSON
  reason: varchar("reason", { length: 500 }),
  ip: varchar("ip", { length: 45 }),
  rollbackToId: integer("rollback_to_id"),  // 回滚指向被回滚的操作ID
  createdAt: timestamp("created_at").defaultNow(),
});
```

### API 接口

```
GET  /api/v1/admin/support/audit-logs          — 操作审计列表
GET  /api/v1/admin/support/audit-logs/:id     — 操作详情
POST /api/v1/admin/support/audit-logs/:id/rollback — 回滚操作
     请求体: { reason: "操作失误" }
```

### 验收标准

1. 客服所有敏感操作记录到操作日志
2. 操作日志展示变更前/变更后详情
3. 敏感操作需要填写原因并二次确认
4. 24 小时内的余额调整操作支持回滚
5. 回滚后的操作也记录在审计日志中


---

### [?] 页面帮助

**页面名称**：功能说明书：§27 在线客服与客服效能增强

**适用角色**：视具体功能而定（参见总览中的优先级和适用角色说明）

**功能定位**：该页面提供 功能说明书：§27 在线客服与客服效能增强 相关的配置、查询和管理能力。

**核心操作**：
1. 查看列表 / 详情
2. 创建 / 编辑 / 删除条目
3. 筛选 / 搜索 / 导出

**注意事项**：
- 部分操作涉及敏感数据，需二次确认或 2FA 身份验证
- 操作记录会写入操作日志

**常见问题**：
Q: 为什么某些操作不可用？
A: 请检查当前账号的权限角色是否包含对应操作权限。

### [?] 按钮级帮助对照表

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 创建/新增 | 添加一条新记录 |
| 编辑 | 修改已有记录的字段内容 |
| 删除 | 删除选中的记录（不可恢复，需确认） |
| 搜索 | 按关键词搜索匹配的记录 |
| 筛选 | 按选中条件过滤列表 |
| 导出 CSV | 将当前列表数据导出为 CSV 文件 |
| 查看详情 | 查看选中记录的完整信息 |
