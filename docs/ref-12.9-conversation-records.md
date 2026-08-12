# 深化参考：§12.9 对话上下文留痕（Conversation Context Audit）

> **对应**：[`PRD-README.md`](PRD-README.md) §12 系统管理员支撑 · 审计合规
> **关联**：[`ref-12.1-audit-console.md`](ref-12.1-audit-console.md)（操作审计控制台）
> **优先级**：P0 | **状态**：✅ 已实现
> **最后更新**：2026-08-12

---

## 概述

`/v1/chat/completions` 每笔请求（含成功 / 失败 / 超时 / 402）落一条**完整上下文**到 `conversation_context_records`，管理员在后台查询 / 回放 / 导出。

**核心价值**：交易纠纷举证（"这笔发出去什么、用的哪把 Key、扣了多少钱"）与政府调证（messages 上文 + 响应原文全量留存）。

**与 `consumption_records` 的关系**：`consumption_records` 只记账（model / tokens / cost / requestId），不存消息内容、实际路由模型、供应商 Key、响应原文；留痕表补齐了举证所需的全部上下文。

---

## 功能模块

### 1. 全量留痕（网关采集）

采集点唯一：`api/src/routes/chat.ts` handler —— 构建 `trace` 累加器，各出口分支填字段，外层 `try { inner try/catch } finally { recordConversationContext(trace) }`，保证 **6 个出口**（mock 流式 / mock 非流式 / 上游错误 / 流式 / 非流式 / 402 余额不足）都落一条。

| 采集字段 | 来源 | 说明 |
|---------|------|------|
| `messages` | 请求体 | **全量原样，不脱敏**（用户拍板），jsonb |
| `responseText` | 上游响应 | 非流式全文；流式聚合全文 |
| `requestedModel` | 请求体 model | 用户请求的模型名 |
| `routedModel` | 路由引擎 | 实际路由到的供应商模型 |
| `supplierId` / `supplierKeyFp` | 路由结果 | 供应商 Key **只存 sha256 指纹**（`fingerprintKey`），不存明文 |
| `clientKeyHash` | `api_keys.key_hash` | 客户端 Key 指纹，复用现有表 |
| `status` / `errorCode` | 出口分支 | `succeeded` / `failed`，失败也记（纠纷高频场景"没成功凭什么扣费"） |
| `inputTokens` / `outputTokens` / `cost` | 计费结果 | 便于与账单对质 |
| `clientIp` / `userAgent` | 请求元数据 | 政府调证所需来源信息 |
| `occurredAt` / `completedAt` | 时间 | 请求发生 / 完成时间 |

**旁路写入**：`recordConversationContext`（`api/src/services/audit/conversation-context.ts`）内部 try/catch 吞错，永不影响主链路；fastify 提前 flush 响应，留痕落库可能比响应晚几毫秒，对举证无影响。

### 2. 后台查询（仅管理员）

菜单：**审计合规 → 💬 对话留痕** → `web-console/src/pages/AdminConversationRecordsPage.tsx`

- **列表**：时间 / 用户 / 请求模型 / 实际路由 / 供应商 / 状态徽章（成功·失败·限流）/ Token / 费用 / 操作
- **筛选**：关键词（messages 内容全文 `ILIKE`）、请求模型、用户 ID、状态、时间范围
- **详情回放**：请求 ID、用户、Key 指纹、模型路由、Token、费用、时间、IP + **上文逐条回放** + **响应全文**
- **导出**：JSON（全量含 messages/responseText）/ CSV（主要字段 + 内容预览截断），上限 5 万条
- **操作审计**：每次查询 / 查看 / 导出写入 `audit_logs`（`resource = 'conversation_record'`），满足"谁能查、查了什么"的监管留痕

### 3. 保留策略 + 自动清理调度器

后台「⚙️ 保留策略」弹窗，配置持久化到 `system_config`（`api/src/services/audit/retention.ts`）：

| 配置项 | 取值 | 说明 |
|-------|------|------|
| `enabled` | true / false | **默认 false = 全量永久保留**，不做自动清理 |
| `retainUnit` × `retainAmount` | 日/周/月/季度/半年/全年 × N | 保留期，超期删除 |
| `pollUnit` | 每天/每周/每月/每季度/每半年/每年 | 轮询频率 |
| `pollHour` | 0-23（UTC+8） | 每日执行时间 |
| `pollDayOfWeek` / `pollDayOfMonth` / `pollMonth` | 视 pollUnit 条件显示 | 周几 / 几号 / 几月执行 |

调度器 `startRetentionScheduler`（`startApp()` 注册）每分钟 tick：
1. 读配置 → 未启用则跳过（永久保留）
2. `isPollDue`（UTC+8，quarter 只在 3/6/9/12 月，halfYear 只在 6/12 月）
3. 周期标识 `pollPeriodKey`（day→`YYYY-MM-DD`、week→ISO `YYYY-Www`、month→`YYYY-MM`、quarter→`YYYYQn`、halfYear→`YYYYHn`、year→`YYYY`）与 `conv_retention_last_poll` 对比，**跨进程防重复**
4. `applyRetention` 删超期（先 `count(*)` 再删，返回条数）→ 写 lastPoll

后台「立即清理」按钮 = 同步执行一次 `runRetentionNow`，返回删除条数，操作计入审计日志。

---

## API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/admin/conversation-records?page=&pageSize=&keyword=&model=&userId=&supplierId=&status=&from=&to=` | 留痕列表 + 组合筛选 + 分页（join users） | admin / super_admin |
| `GET` | `/api/v1/admin/conversation-records/:requestId` | 单条详情（会话回放，join user/apiKey/supplier） | admin / super_admin |
| `GET` | `/api/v1/admin/conversation-records/export?format=csv\|json&filters=` | 导出当前筛选（上限 5 万条） | admin / super_admin |
| `GET` | `/api/v1/admin/conversation-records/retention` | 读取保留策略 + 上次执行周期 + 当前周期 | admin / super_admin |
| `PUT` | `/api/v1/admin/conversation-records/retention` | 保存保留策略（body: enabled/retainUnit/retainAmount/pollUnit/pollHour/...） | admin / super_admin |
| `POST` | `/api/v1/admin/conversation-records/retention/run` | 立即执行清理，返回 `{ deleted, config }` | admin / super_admin |

> 路由注册在 `api/src/routes/admin-conversation-records.ts`；静态路由（`/retention`）注册在动态 `/:requestId` **之前**（Fastify 路由顺序）。

---

## Drizzle Schema

`api/src/db/schema/conversation-context.ts` → 表 `conversation_context_records`：

```ts
export const conversationContextRecords = pgTable('conversation_context_records', {
  id: serial('id').primaryKey(),
  requestId: varchar('request_id', { length: 100 }).notNull().unique(),
  userId: integer('user_id').notNull().references(() => users.id),   // ⚠️ 无 ON DELETE CASCADE
  apiKeyId: integer('api_key_id').references(() => apiKeys.id),
  clientKeyHash: varchar('client_key_hash', { length: 255 }).notNull(),
  requestedModel: varchar('requested_model', { length: 200 }).notNull(),
  routedModel: varchar('routed_model', { length: 200 }),
  supplierId: integer('supplier_id').references(() => suppliers.id),
  supplierModelId: integer('supplier_model_id').references(() => supplierModels.id),
  supplierKeyFp: varchar('supplier_key_fp', { length: 64 }),
  messages: jsonb('messages').notNull(),
  responseText: text('response_text'),
  finishReason: varchar('finish_reason', { length: 50 }),
  status: varchar('status', { length: 20 }).notNull(),
  errorCode: varchar('error_code', { length: 50 }),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cost: numeric('cost', { precision: 18, scale: 8 }),
  clientIp: varchar('client_ip', { length: 50 }),
  userAgent: text('user_agent'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_ccr_request_id').on(table.requestId),
  index('idx_ccr_user').on(table.userId),
  index('idx_ccr_status').on(table.status),
  index('idx_ccr_supplier').on(table.supplierId),
  index('idx_ccr_occurred').on(table.occurredAt),
  index('idx_ccr_user_occurred').on(table.userId, table.occurredAt),
]);
```

`system_config` 新增 key：`conv_retention`（保留策略 JSON）、`conv_retention_last_poll`（上次执行周期 key）。

> 表结构由 `drizzle-kit push` 推送（纯新增表，避开 db:migrate 引导坑，见 `docs/README.md` 数据字典一节）。

---

## 前端组件 Props

`web-console/src/pages/AdminConversationRecordsPage.tsx`

```tsx
interface ConversationRecordRow {
  requestId: string;
  occurredAt: string;
  userId: number;
  email: string;            // join users
  name: string;
  requestedModel: string;
  routedModel: string | null;
  supplierId: number | null;
  status: string;           // succeeded / failed / rate_limited
  errorCode: string | null;
  inputTokens: number;
  outputTokens: number;
  cost: string | null;      // numeric → 字符串
  finishReason: string | null;
  clientIp: string | null;
}

interface RetentionConfig {
  enabled: boolean;
  retainUnit: 'day' | 'week' | 'month' | 'quarter' | 'halfYear' | 'year';
  retainAmount: number;
  pollUnit: 'day' | 'week' | 'month' | 'quarter' | 'halfYear' | 'year';
  pollHour: number;         // 0-23 UTC+8
  pollDayOfWeek: number;    // 0-6, 0=周日
  pollDayOfMonth: number;   // 1-31
  pollMonth: number;        // 1-12
}
```

菜单注册：`web-console/src/layouts/ConsoleLayout.tsx` 审计合规组 → `{ to: "/admin/audit/conversation-records", label: "对话留痕", icon: "💬" }`；路由：`web-console/src/App.tsx` `<Route path="admin/audit/conversation-records" />`。

---

## 边界条件

| 场景 | 处理方式 |
|------|---------|
| 内容敏感 | **全量原样存储、不脱敏**（用户明确要求，供调证） |
| 供应商 Key 泄露 | 只存 sha256 指纹（`fingerprintKey`），前端仅展示指纹 |
| 失败请求 | 一并留痕（`status=failed` + errorCode），供"没成功也扣了/发了什么"举证 |
| 留痕写入失败 | 旁路吞错，不影响主链路 |
| 数据量过大 | 保留策略调度器按 `system_config` 配置清理（默认永久保留） |
| 删除用户 | `user_id` 无 CASCADE，会留孤儿行，需另行清理 |
| 并发重复清理 | `conv_retention_last_poll` 周期 key 防重复，跨进程生效 |

---

## 验收标准

1. 成功 / 失败 / 超时 / 402 请求都各落一条完整留痕（6 个出口全覆盖）
2. 后台可按关键词 / 模型 / 用户 / 状态 / 时间筛选，查看完整上下文回放
3. 导出 JSON（全量）/ CSV，写入审计日志
4. 保留策略可配置，命中轮询计划自动清理，立即清理返回删除条数
5. 所有查询 / 导出操作记录到 `audit_logs`，满足"谁能查、查了什么"监管要求

---

## 关联模块

| 模块 | 关联方式 |
|------|---------|
| §12.1 操作审计控制台 | 留痕查询操作本身写入 `audit_logs`，与审计控制台同源 |
| `ref-2.2.4-call-logs.md` | 调用日志是用户自助视角；对话留痕是后台调证视角（内容更深） |
| `ref-5.2-billing.md` | 留痕的 tokens/cost 与计费结算同源，可对质账单 |

---

### [?] 页面帮助
**页面名称**：对话上下文留痕
**核心操作**：筛选留痕、查看会话回放、导出（JSON/CSV）、配置保留策略、立即清理
**注意事项**：内容为全量明文存储，仅限 admin/super_admin 访问；查询/导出均计入审计日志
