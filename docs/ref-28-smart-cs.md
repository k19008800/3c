# 深化参考：§28 智能客服辅助与测试工具

> **对应**：[`SPEC-§28-智能客服与测试工具.md`](SPEC-§28-智能客服与测试工具.md)
> **关联**：[`ref-10.1-support-workbench.md`](ref-10.1-support-workbench.md)、[`SPEC-§27-在线客服与客服效能.md`](SPEC-§27-在线客服与客服效能.md)
> **优先级**：P1 | **状态**：需求文档（待开发）
> **最后更新**：2026-07-31

---

## 概述

本模块辅助客服团队提高效率，包含 4 项能力：意图识别与知识推荐、异常自动诊断、用户视角查看、API 模拟调用与临时测试 Key。不替代人工客服，而是缩短客服的排查和响应时间。

---

## §28.1 意图识别与知识推荐（已实现）

> ⚠️ 已在先前开发中完成基础实现，后端集成 AI 服务进行用户输入分析。

### 数据表结构

```typescript
// cs_intent_classifier — 客服意图分类配置
export const csIntentClassifier = pgTable("cs_intent_classifier", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  keywords: text("keywords"),  // JSON: 关联关键词数组
  category: varchar("category", { length: 30 }).notNull(),
    // 'billing' | 'api' | 'account' | 'key' | 'suggestion'
  priority: integer("priority").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// cs_intent_logs — 意图识别日志
export const csIntentLogs = pgTable("cs_intent_logs", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 100 }),
  userMessage: text("user_message"),
  matchedIntent: varchar("matched_intent", { length: 50 }),
  confidence: numeric("confidence", { precision: 4, scale: 2 }),
  recommendedActions: text("recommended_actions"), // JSON
  usedByAgent: boolean("used_by_agent").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});
```

### API 接口

```
POST   /api/v1/admin/cs/intent/analyze           — 分析用户输入意图
  body: { message: string, context?: { userId?, ticketId? }}
  response: { intent: string, confidence: number, suggestedReplies: string[] }

GET    /api/v1/admin/cs/intent/config             — 意图配置列表
POST   /api/v1/admin/cs/intent/config             — 添加意图规则
PUT    /api/v1/admin/cs/intent/config/:id         — 编辑意图规则
DELETE /api/v1/admin/cs/intent/config/:id         — 删除意图规则

GET    /api/v1/admin/cs/intent/logs                — 意图识别日志
  params: { dateFrom?, dateTo?, confidenceMin?, page, limit }
```

### 前端组件

```tsx
<IntentAnalysisResult
  intent: string
  confidence: number
  suggestedActions: Suggestion[]
  onUseSuggestion: (suggestion: Suggestion) => void
/>

<IntentConfigPanel
  rules: IntentRule[]
  onCreate: (rule: IntentRuleInput) => Promise<void>
  onUpdate: (id: number, rule: Partial<IntentRule>) => Promise<void>
  onDelete: (id: number) => Promise<void>
/>

interface IntentRule {
  id: number
  name: string
  keywords: string[]
  category: string
  priority: number
  isActive: boolean
}

interface Suggestion {
  type: 'knowledge_article' | 'quick_reply' | 'action' | 'diagnostic'
  title: string
  content: string
  confidence: number
}
```

### 验收标准

| # | 用例 | 预期 |
|---|------|------|
| 28.1-1 | 客服输入"用户说充值没到账" | 系统识别为 billing 意图，推荐对账查询操作 |
| 28.1-2 | 识别结果推荐知识库文章 | 匹配到相关 FAQ 或知识库文章 |
| 28.1-3 | 客服采纳推荐 | 一键插入回复内容到对话 |
| 28.1-4 | 管理员配置意图规则 | 新增/编辑/删除关键词组合 |

---

## §28.2 异常自动诊断

### 数据表结构

```typescript
// cs_diagnostic_rules — 异常诊断规则
export const csDiagnosticRules = pgTable("cs_diagnostic_rules", {
  id: serial("id").primaryKey(),
  category: varchar("category", { length: 30 }).notNull(),
    // 'recharge' | 'api_call' | 'balance' | 'key' | 'rate_limit'
  condition: text("condition").notNull(),
    // JSON: { field, operator, value, logic }
  diagnosisResult: text("diagnosis_result").notNull(),
    // JSON: { type, title, description, suggestedAction, severity }
  priority: integer("priority").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// cs_diagnostic_logs — 诊断日志
export const csDiagnosticLogs = pgTable("cs_diagnostic_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  triggerSource: varchar("trigger_source", { length: 30 }),
    // 'agent_manual' | 'auto_intent' | 'ticket_creation'
  category: varchar("category", { length: 30 }),
  matchedRules: text("matched_rules"), // JSON: 规则ID数组
  diagnosis: text("diagnosis"),        // JSON: 完整的诊断结果
  agentUsed: boolean("agent_used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});
```

### 诊断场景

| 场景 | 自动检查项 | 输出结果 |
|------|-----------|---------|
| 充值未到账 | 回调状态、渠道余额、最近充值记录 | "充值已确认，但赠送余额每日释放" 或 "充值回调失败，需手动补单" |
| API 调用失败 | Key 状态、模型可用性、余额、限流 | "API Key 已过期" / "模型暂不可用" / "余额不足" |
| 余额异常 | 最近充值/消费记录、计费日志 | "消费记录正常" / "存在并发扣款可能的重复记录" |
| Key 创建失败 | 配额限制、重复名称 | "已达到最大 Key 数(50)" / "该名称已被使用" |
| 限流误判 | 当前限流窗口计数、实际调用量 | "确实已触发限流" / "可在 X 秒后重试" |

### API 接口

```
POST   /api/v1/admin/cs/diagnose                 — 执行异常诊断
  body: { userId, category, context?: { ticketId?, extraParams? }}
  response: { matched: DiagnosticResult[], summary: string }

GET    /api/v1/admin/cs/diagnose/rules            — 诊断规则列表
POST   /api/v1/admin/cs/diagnose/rules            — 添加诊断规则
PUT    /api/v1/admin/cs/diagnose/rules/:id        — 编辑规则
DELETE /api/v1/admin/cs/diagnose/rules/:id        — 删除规则
GET    /api/v1/admin/cs/diagnose/logs             — 诊断日志
```

### 前端组件

```tsx
<DiagnosticPanel
  userId: number
  category: string
  onDiagnose: (userId: number, category: string) => Promise<DiagnosticResult[]>
  results: DiagnosticResult[]
  loading: boolean
/>

interface DiagnosticResult {
  type: 'success' | 'warning' | 'error' | 'info'
  title: string
  description: string
  suggestedAction: string
  severity: 'low' | 'normal' | 'high'
  data?: any  // 相关数据
}
```

### 验收标准

| # | 用例 | 预期 |
|---|------|------|
| 28.2-1 | 客服对可疑用户点"诊断" | 系统检查各项数据返回诊断结论 |
| 28.2-2 | 诊断提示"充值回调失败" | 附带具体充值记录和时间点 |
| 28.2-3 | 诊断提示"余额不足" | 显示当前余额、最近消费趋势 |
| 28.2-4 | 管理员配置诊断规则 | IF-THEN 规则引擎管理（如 IF 充值回调状态 != success THEN ...） |

---

## §28.3 用户视角查看

### 功能描述

客服在管理后台以用户的视角查看用户端页面——即完全模拟用户的登录状态和权限，查看用户看到的界面和数据。用于确认用户反馈的问题是否确实存在。

### API 接口

```
POST   /api/v1/admin/cs/user-view/login          — 获取用户视角临时 Token
  body: { userId, durationMinutes: 30 }
  response: { token: string, expiresAt: string, viewUrl: string }

POST   /api/v1/admin/cs/user-view/revoke         — 吊销临时 Token
  body: { token: string }
```

### 数据表结构

```typescript
// cs_user_view_tokens — 用户视角临时会话
export const csUserViewTokens = pgTable("cs_user_view_tokens", {
  id: serial("id").primaryKey(),
  adminUserId: integer("admin_user_id").notNull(),
  targetUserId: integer("target_user_id").notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  isRevoked: boolean("is_revoked").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});
```

### 安全约束

| 规则 | 说明 |
|------|------|
| 权限要求 | 仅 support / operator / admin 角色可用 |
| 有效期 | 自动过期（默认 30 分钟，最长 60 分钟） |
| 会话隔离 | 使用用户视角时后台记录所有操作 |
| 不可操作 | 用户视角仅查看，不可进行充值/创建 Key 等写操作 |
| 审计日志 | 每次查看写入操作审计日志 |
| 实时吊销 | 管理员可随时吊销 |

### 验收标准

| # | 用例 | 预期 |
|---|------|------|
| 28.3-1 | 客服使用用户视角 | 以用户身份登录，看到用户的数据 |
| 28.3-2 | 30 分钟自动过期 | 超时后自动退出，Token 失效 |
| 28.3-3 | 权限限制 | 低权限管理员不可使用该功能 |
| 28.3-4 | 操作审计 | 每次进入用户视角记录 who+when+target |

---

## §28.4 API 模拟调用与临时测试 Key

### 功能描述

客服可以在管理后台模拟 API 调用，快速定位是用户端错误还是平台端问题。同时可为用户生成临时测试 Key，方便用户快速验证配置。

### API 接口

```
POST   /api/v1/admin/cs/simulate-call             — 模拟 API 调用
  body: { 
    model: string          // 模型名称
    provider?: string      // 指定供应商（可选）
    apiKey: string         // 用户的 Key
    messages: ChatMessage[]  // 测试消息
    maxTokens?: number
  }
  response: { 
    success: boolean, 
    result?: { content, tokens, latency, model }
    error?: { code, message, details? }
    routeInfo?: { chosenProvider, fallbackUsed, latency }
  }

POST   /api/v1/admin/cs/temp-key/create           — 生成临时测试 Key
  body: { 
    userId: number, 
    durationMinutes: 60,
    modelIds: number[],
    maxCalls: number,
    maxTokens: number
  }
  response: { key: string, keyPrefix: string, expiresAt, maxCalls, maxTokens }

POST   /api/v1/admin/cs/temp-key/revoke           — 吊销临时 Key
  body: { keyId: number }
```

### 数据表结构

```typescript
// cs_temp_keys — 临时测试 Key
export const csTempKeys = pgTable("cs_temp_keys", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  createdBy: integer("created_by").notNull().references(() => users.id),
  keyPrefix: varchar("key_prefix", { length: 20 }).notNull(), // 如 tmp-sk-xxx
  keyHash: varchar("key_hash", { length: 64 }).notNull(),
  modelIds: text("model_ids"),  // JSON: [1,2,3]
  maxCalls: integer("max_calls").default(100),
  usedCalls: integer("used_calls").default(0),
  maxTokens: bigint("max_tokens", { mode: "number" }).default(1000000),
  usedTokens: bigint("used_tokens", { mode: "number" }).default(0),
  expiresAt: timestamp("expires_at").notNull(),
  isRevoked: boolean("is_revoked").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// cs_simulate_call_logs — 模拟调用记录
export const csSimulateCallLogs = pgTable("cs_simulate_call_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  adminUserId: integer("admin_user_id").notNull(),
  modelName: varchar("model_name", { length: 100 }),
  provider: varchar("provider", { length: 100 }),
  success: boolean("success"),
  latency: integer("latency"), // ms
  tokensUsed: integer("tokens_used"),
  errorCode: varchar("error_code", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
});
```

### 前端组件

```tsx
<SimulateCallPanel
  models: { id: number; name: string; provider: string }[]
  onSimulate: (params: SimulateParams) => Promise<SimulateResult>
  result?: SimulateResult
  loading: boolean
/>

<TempKeyManager
  userId: number
  keys: TempKey[]
  onCreate: (params: CreateTempKeyParams) => Promise<TempKey>
  onRevoke: (keyId: number) => Promise<void>
/>

interface SimulateParams {
  model: string
  apiKey: string
  messages: { role: string; content: string }[]
  maxTokens?: number
  provider?: string
}

interface SimulateResult {
  success: boolean
  result?: { content: string; tokens: number; latency: number; model: string }
  error?: { code: string; message: string; details?: string }
  routeInfo?: { chosenProvider: string; fallbackUsed: boolean; latency: number }
}

interface TempKey {
  id: number
  keyPrefix: string
  expiresAt: string
  maxCalls: number
  usedCalls: number
  maxTokens: number
  usedTokens: number
  isRevoked: boolean
  createdAt: string
}
```

### 验收标准

| # | 用例 | 预期 |
|---|------|------|
| 28.4-1 | 客服模拟 API 调用 | 使用用户 Key+模型，完整模拟返回结果或错误 |
| 28.4-2 | 模拟结果显示路由信息 | 实际调用的供应商、响应时间、是否回退 |
| 28.4-3 | 生成临时测试 Key | 限定 1 小时有效期、100 次调用、100 万 Token |
| 28.4-4 | 临时 Key 到期自动失效 | 超过有效期或限量后返回错误 |
| 28.4-5 | 管理员吊销临时 Key | 立即生效，已生成的 Key 不可用 |

---

## 边界条件

| # | 场景 | 处理方式 |
|---|------|---------|
| CS-001 | 意图识别置信度过低（< 30%） | 不推荐任何操作，标记为"未识别"，供管理员调优 |
| CS-002 | 诊断过程中用户数据访问异常 | 返回部分可用结果并提示"部分检查项不可用" |
| CS-003 | 用户视角 Token 泄露 | 管理员可批量吊销，所有会话强制登出 |
| CS-004 | 模拟调用产生实际计费 | 模拟调用不计费，消耗计入 cs_simulate_call_logs |
| CS-005 | 临时 Key 余额耗尽 | 超出额度时返回额度耗尽错误，Key 自动标记为 expired |
| CS-006 | 多客服同时诊断同一用户 | 各自独立诊断，不互相影响；写审计日志时记录多个 session |

---

## 上下游关系

```
§28 智能客服:
  ├── §28.1 意图识别: csIntentClassifier → 知识库(ref-10.2) → 快捷回复(ref-10.4)
  ├── §28.2 异常诊断: csDiagnosticRules → 计费引擎(§5.2) → 余额/Key/限流服务
  ├── §28.3 用户视角: csUserViewTokens → 认证服务 → 审计日志(ref-4.6)
  ├── §28.4 模拟调用: csTempKeys + 模拟引擎 → 路由系统(§5.1) → 计费(不计费)
  └── 客服工作台: ref-10.1-support-workbench 集成所有智能客服能力
```
