# 账号注销 — 业务概述 + 后端 API 规格

> **所属 Sprint**：Sprint 1 | **优先级**：P0 | **版本**：V1.5

---

## 1. 业务规则

### 1.1 核心规则与设计约束

| 规则 | 说明 | 来源 |
|------|------|------|
| 软删除，不硬删 | 不 DELETE 用户行，只脱敏个人字段 | 数据合规要求 |
| 7 天冷静期 | coolingDeadline = createdAt + 7 天，精确到秒 | 用户反悔空间 |
| 6 项前置检查 | 全部通过才进入冷却期，有一项不通过就返回 400 + 失败清单 | 运营风控 |
| 冷却期限制 | 403 拦截，仅放行 GET /me/deletion 和用户基本信息 | 保护期 |
| 数据脱敏不可逆 | nickname/email/phone/avatar 脱敏后无法恢复 | 合规 |
| 关联记录保留 | 消费记录/调用日志保留，但关联不可反查原用户 | 财务审计 |
| 管理员可驳回/强制 | 驳回需原因(≥5字符)，强制不可逆 | 运营可控 |

### 1.2 全流程时间线

```
T+0     用户提交 POST /me/deletion → 6项检查
          ├── 全通过 → status=cooling, coolingDeadline=T+7d, Key全部禁用
          └── 有不通过 → status=pending, 返回失败清单

T+0~T+7 冷却期
          ├── 可 GET 查看状态
          ├── 可 DELETE 撤销
          ├── 管理员可 POST reject 驳回
          ├── 管理员可 POST force 强制注销
          └── 用户不可调 API/充值/新建Key/提现/发票

T+7     冷却期到（定时任务每小时扫描）
          ├── 脱敏 nickname, email, phone, avatar_url
          ├── status=completed, completedAt=NOW()
          └── 用户下次登录 403 ACCOUNT_DELETED
```

### 1.3 状态机

```
           提交(POST)
               │
          ┌────▼────┐
          │ 6项检查 │
          └────┬────┘
       ┌───────┴───────┐
       ▼               ▼
   ┌────────┐    ┌──────────┐
   │ cooling│    │  400返回  │
   │ 冷却期  │    │ 失败清单  │
   └───┬────┘    └──────────┘
       │
   ┌───┴────┬────────┬──────┐
   │        │        │      │
   ▼        ▼        ▼      ▼
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│撤销  │ │到期  │ │强制  │ │驳回  │
│DELETE│ │cron  │ │admin │ │admin │
└──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘
   │       │        │        │
   ▼       ▼        ▼        ▼
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│cancel│ │compl │ │compl │ │rejec │
│-lled │ │-eted │ │-eted │ │-ted  │
└──────┘ └──────┘ └──────┘ └──────┘
```

---

## 2. 数据表 Drizzle Schema（完整）

### 2.1 account_deletion_requests

```typescript
import { pgTable, serial, integer, text, varchar, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

export const accountDeletionRequests = pgTable('account_deletion_requests', {
  /** 自增主键 */
  id: serial('id').primaryKey(),

  /** FK → users.id，CASCADE 删除 */
  userId: integer('user_id').notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  /** 用户填写的注销原因，最长 500 字符 */
  reason: text('reason'),

  /** 当前状态：pending/cooling/completed/cancelled/rejected */
  status: varchar('status', { length: 20 }).notNull().default('pending'),

  /** 冷却期截止时间（精确到毫秒）: cooling 时必填，其他状态 NULL */
  coolingDeadline: timestamp('cooling_deadline', { withTimezone: true }),

  /** 用户撤销时间 */
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),

  /** 实际注销完成时间 */
  completedAt: timestamp('completed_at', { withTimezone: true }),

  /** 管理员驳回原因 */
  rejectedReason: text('rejected_reason'),

  /** 管理员操作人 ID */
  processedBy: integer('processed_by').references(() => users.id),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // 一个用户一次最多一个活跃请求（pending 或 cooling）
  uniqueUserStatus: uniqueIndex('idx_deletion_user_status')
    .on(table.userId, table.status)
    .where(sql`status IN ('pending', 'cooling')`),
  // 加速定时任务扫描 cooling 到期
  coolingExpiryIdx: index('idx_deletion_cooling_expiry')
    .on(table.status, table.coolingDeadline)
    .where(sql`status = 'cooling'`),
}));
```

### 2.2 deletion_checklist

```typescript
export const deletionChecklist = pgTable('deletion_checklist', {
  id: serial('id').primaryKey(),
  requestId: integer('request_id').notNull()
    .references(() => accountDeletionRequests.id, { onDelete: 'cascade' }),
  checkItem: varchar('check_item', { length: 50 }).notNull(),
  passed: varchar('passed', { length: 10 }).notNull().default('false'),  // 'true' | 'false'
  detail: text('detail'),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueRequestItem: uniqueIndex('idx_checklist_request_item').on(table.requestId, table.checkItem),
}));
```

### 2.3 枚举值与常量

```typescript
export const DELETION_STATUS_ENUM = {
  PENDING: 'pending',    // 待处理（条件未全通过）
  COOLING: 'cooling',    // 冷却期
  COMPLETED: 'completed', // 已注销（终态）
  CANCELLED: 'cancelled', // 已撤销
  REJECTED: 'rejected',   // 已驳回
} as const;

export const CHECK_ITEM_ENUM = {
  BALANCE_CLEARED: 'balance_cleared',
  NO_PENDING_WITHDRAW: 'no_pending_withdraw',
  NO_UNSETTLED_BILLS: 'no_unsettled_bills',
  NO_ACTIVE_KEYS: 'no_active_keys',
  NO_PENDING_INVOICES: 'no_pending_invoices',
  NO_ACTIVE_AGENT: 'no_active_agent',
} as const;
```

### 2.4 迁移 SQL

```sql
-- 2026-07-27-account-deletion.sql

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  cooling_deadline TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  rejected_reason TEXT,
  processed_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_deletion_user_status ON account_deletion_requests(user_id, status) WHERE status IN ('pending', 'cooling');
CREATE INDEX idx_deletion_cooling_expiry ON account_deletion_requests(status, cooling_deadline) WHERE status = 'cooling';

CREATE TABLE IF NOT EXISTS deletion_checklist (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES account_deletion_requests(id) ON DELETE CASCADE,
  check_item VARCHAR(50) NOT NULL,
  passed VARCHAR(10) NOT NULL DEFAULT 'false',
  detail TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_checklist_request_item ON deletion_checklist(request_id, check_item);
```

---

## 3. Service 层 — 六项检查

**文件**：`api/src/services/deletion-checks.ts`

### 3.1 并发执行全部 6 项检查

```typescript
interface CheckOutput {
  item: string;
  passed: 'true' | 'false';
  detail: string;
}

export async function runAllDeletionChecks(userId: number): Promise<CheckOutput[]> {
  const [userRow, agentRow] = await Promise.all([
    db.select({ balance: users.balance }).from(users).where(eq(users.id, userId)).limit(1),
    db.select({ id: agents.id }).from(agents).where(eq(agents.userId, userId)).limit(1),
  ]);

  const user = userRow[0];
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', '用户不存在');

  const isAgent = !!agentRow[0];
  const agentId = agentRow[0]?.id;

  // 全部并行执行，使用 allSettled 防止一个失败阻塞全部
  const results = await Promise.allSettled([
    checkBalance(user.balance),
    checkWithdraw(userId, agentId, isAgent),
    checkRecharge(userId),
    checkKeys(userId),
    checkInvoices(userId),
    checkAgentClients(agentId, isAgent),
  ]);

  const keys: (keyof typeof CHECK_ITEM_ENUM)[] = ['BALANCE_CLEARED','NO_PENDING_WITHDRAW','NO_UNSETTLED_BILLS',
    'NO_ACTIVE_KEYS','NO_PENDING_INVOICES','NO_ACTIVE_AGENT'];

  return results.map((r, i) => ({
    item: CHECK_ITEM_ENUM[keys[i]],
    ...(r.status === 'fulfilled' ? r.value : { passed: 'false' as const, detail: '检查服务异常，请稍后重试' }),
  }));
}
```

### 3.2 各检查项实现（含边界）

```typescript
// 检查 1: 余额
async function checkBalance(balance: number | null): Promise<CheckOutput> {
  const b = Number(balance ?? 0);
  if (b === 0) return { item: 'balance_cleared', passed: 'true', detail: '余额 ¥0.00，已清零' };
  if (b > 0) return { item: 'balance_cleared', passed: 'false', detail: `当前余额 ¥${b.toFixed(2)}，请先消费或申请退款` };
  return { item: 'balance_cleared', passed: 'false', detail: `当前欠费 ¥${Math.abs(b).toFixed(2)}，请先结清欠费` };
}

// 检查 2: 进行中提现（仅 agent）
async function checkWithdraw(userId: number, agentId: number | undefined, isAgent: boolean): Promise<CheckOutput> {
  if (!isAgent) return { item: 'no_pending_withdraw', passed: 'true', detail: '非代理用户，无需检查' };
  // 需要 JOIN withdraw_orders.agent_id = agents.id → agents.user_id = userId
  const [row] = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt FROM withdraw_orders wo
    WHERE wo.agent_id = ${agentId} AND wo.status NOT IN ('approved', 'paid', 'rejected')
  `);
  if (row.cnt === 0) return { item: 'no_pending_withdraw', passed: 'true', detail: '无进行中提现' };
  return { item: 'no_pending_withdraw', passed: 'false', detail: `存在 ${row.cnt} 笔进行中的提现申请，请等待完成后重试` };
}

// 检查 3: 未完成充值
async function checkRecharge(userId: number): Promise<CheckOutput> {
  const [row] = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt FROM recharge_orders WHERE user_id = ${userId} AND status = 'pending'
  `);
  if (row.cnt === 0) return { item: 'no_unsettled_bills', passed: 'true', detail: '无未完成充值' };
  return { item: 'no_unsettled_bills', passed: 'false', detail: `存在 ${row.cnt} 笔未完成的充值订单，请等待完成或取消` };
}

// 检查 4: 活跃 Key
async function checkKeys(userId: number): Promise<CheckOutput> {
  const [row] = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt FROM api_keys WHERE user_id = ${userId} AND status = 'active'
  `);
  if (row.cnt === 0) return { item: 'no_active_keys', passed: 'true', detail: '无活跃 API Key' };
  return { item: 'no_active_keys', passed: 'false', detail: `存在 ${row.cnt} 个活跃的 API Key，请先在 Key 管理页面禁用` };
}

// 检查 5: 进行中发票
async function checkInvoices(userId: number): Promise<CheckOutput> {
  const [row] = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt FROM invoice_requests WHERE user_id = ${userId} AND status IN ('pending', 'processing')
  `);
  if (row.cnt === 0) return { item: 'no_pending_invoices', passed: 'true', detail: '无进行中发票' };
  return { item: 'no_pending_invoices', passed: 'false', detail: `存在 ${row.cnt} 笔进行中的发票申请，请等待完成后重试` };
}

// 检查 6: 代理客户绑定
async function checkAgentClients(agentId: number | undefined, isAgent: boolean): Promise<CheckOutput> {
  if (!isAgent) return { item: 'no_active_agent', passed: 'true', detail: '非代理用户，无需检查' };
  const [row] = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt FROM agent_clients WHERE agent_id = ${agentId}
  `);
  if (row.cnt === 0) return { item: 'no_active_agent', passed: 'true', detail: '无代理客户绑定' };
  return { item: 'no_active_agent', passed: 'false', detail: `您是代理，名下有 ${row.cnt} 个绑定客户，请先在代理管理页面转移或解约所有客户` };
}
```

---

## 4. 路由 — 用户端（完整 Fastify 路由）

### 4.1 文件结构

```
api/src/routes/me/deletion.ts
  ├── POST /api/v1/me/deletion     — 提交注销申请
  ├── GET  /api/v1/me/deletion     — 查看注销状态
  └── DELETE /api/v1/me/deletion   — 撤销注销
```

### 4.2 POST /api/v1/me/deletion — 提交注销申请

**请求体**：
```json
{
  "reason": "不再使用该平台"
}
```

**字段校验规则**：

| 字段 | 类型 | 必填 | 最大长度 | 空白处理 | 无效值处理 |
|------|------|------|---------|---------|----------|
| reason | string | 否 | 500 字符 | 全空格→null | 超过 500 → 400 VALIDATION_ERROR |

**完整响应枚举**：

| 场景 | HTTP | error | message | data |
|------|------|-------|---------|------|
| 全通过 | 200 | — | "注销申请已提交，进入 7 天冷静期" | {requestId, coolingDeadline, freezeDays} |
| 有不通过 | 400 | DELETION_CHECKS_FAILED | "注销条件未满足，请先处理以下事项" | { checks: [{item, passed, detail}] } |
| 已有 cooling 申请 | 409 | ACTIVE_DELETION_EXISTS | "您已提交过注销申请，当前处于冷静期" | — |
| 已有 pending 申请 | 409 | ACTIVE_DELETION_EXISTS | "您有一个待处理的注销申请" | — |
| 未登录 | 401 | UNAUTHORIZED | "请先登录" | — |

**成功响应(200)**：
```json
{
  "code": 0,
  "message": "注销申请已提交，进入 7 天冷静期",
  "data": {
    "requestId": 17,
    "coolingDeadline": "2026-08-03T18:30:00.000Z",
    "freezeDays": 7
  }
}
```

**失败响应(400)**：
```json
{
  "code": 400,
  "error": "DELETION_CHECKS_FAILED",
  "message": "注销条件未满足，请先处理以下事项后再重新提交",
  "data": {
    "checks": [
      { "item": "balance_cleared", "passed": "true", "detail": "余额 ¥0.00，已清零" },
      { "item": "no_active_keys", "passed": "false", "detail": "存在 2 个活跃的 API Key，请先在 Key 管理页面禁用" },
      { "item": "no_pending_withdraw", "passed": "true", "detail": "非代理用户，无需检查" },
      { "item": "no_unsettled_bills", "passed": "true", "detail": "无未完成充值" },
      { "item": "no_pending_invoices", "passed": "false", "detail": "存在 1 笔进行中的发票申请，请等待完成后重试" },
      { "item": "no_active_agent", "passed": "true", "detail": "非代理用户，无需检查" }
    ]
  }
}
```

**关键实现细节**：
- reason 最大 500 字符，超出时在 handler 内截断 `reason?.slice(0, 500)`，不返回 400
- Key 禁用必须在事务内：写入 request 记录 + 检查清单 + 禁用 Key 三者在同一个事务
- coolingDeadline = `new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)`

### 4.3 GET /api/v1/me/deletion — 查看注销状态

**路径参数**：无

**完整响应枚举**：

| 场景 | HTTP | data.status | 说明 |
|------|------|-------------|------|
| 有 cooling 记录 | 200 | cooling | 返回完整 request + checks |
| 有 cancelled 记录 | 200 | cancelled | |
| 有 rejected 记录 | 200 | rejected | 含 rejectedReason |
| 有 completed 记录 | 200 | completed | 含 completedAt |
| 无任何记录 | 404 | — | error=NO_DELETION_REQUEST |

**成功响应(200, cooling)**：
```json
{
  "code": 0,
  "data": {
    "id": 5,
    "userId": 101,
    "reason": "不再使用该平台",
    "status": "cooling",
    "coolingDeadline": "2026-08-03T18:30:00.000Z",
    "cancelledAt": null,
    "completedAt": null,
    "rejectedReason": null,
    "processedBy": null,
    "createdAt": "2026-07-27T18:30:00.000Z",
    "updatedAt": "2026-07-27T18:30:00.000Z",
    "checks": [
      { "checkItem": "balance_cleared", "passed": "true", "detail": "余额 ¥0.00，已清零" },
      { "checkItem": "no_active_keys", "passed": "true", "detail": "无活跃 API Key" }
    ]
  }
}
```

**404 响应**：
```json
{
  "code": 404,
  "error": "NO_DELETION_REQUEST",
  "message": "您尚未提交注销申请"
}
```

### 4.4 DELETE /api/v1/me/deletion — 撤销注销

**路径参数**：无

**完整响应枚举**：

| 场景 | HTTP | error | message |
|------|------|-------|---------|
| 撤销成功 | 200 | — | "注销申请已撤销，账户已恢复正常使用" |
| 无可撤销申请 | 400 | NO_ACTIVE_DELETION | "当前没有可撤销的注销申请" |
| 申请已 completed | 400 | NO_ACTIVE_DELETION | "当前没有可撤销的注销申请" |

**注意**：只有 status='cooling' 才可撤销。cancelled/completed/rejected 不能撤销。

---

## 5. 路由 — 管理端（完整 Fastify 路由）

### 5.1 文件结构

```
api/src/routes/admin/deletion.ts
  ├── GET   /api/v1/admin/deletion — 注销请求列表
  ├── GET   /api/v1/admin/users/:id/deletion — 某用户注销详情
  ├── POST  /api/v1/admin/users/:id/deletion/reject — 驳回
  └── POST  /api/v1/admin/users/:id/deletion/force — 强制注销
```

### 5.2 GET /api/v1/admin/deletion — 注销请求列表

**Query 参数**：

| 参数 | 类型 | 必填 | 默认 | 最大值 | 校验 |
|------|------|------|------|--------|------|
| status | string | 否 | — | — | 必须是枚举值，否则忽略 |
| search | string | 否 | — | 50 字符 | 超长截断 |
| limit | integer | 否 | 20 | 100 | ≤0→20, >100→100 |
| offset | integer | 否 | 0 | — | <0→0 |

**成功响应(200)**：
```json
{
  "code": 0,
  "data": {
    "rows": [
      {
        "id": 17,
        "userId": 101,
        "userEmail": "zhangsan@example.com",
        "userNickname": "张三",
        "reason": "不再使用",
        "status": "cooling",
        "coolingDeadline": "2026-08-03T18:30:00.000Z",
        "createdAt": "2026-07-27T18:30:00.000Z"
      },
      {
        "id": 16,
        "userId": 102,
        "userEmail": "lisi@example.com",
        "userNickname": "李四",
        "reason": null,
        "status": "pending",
        "coolingDeadline": null,
        "createdAt": "2026-07-26T09:15:00.000Z"
      }
    ],
    "stats": {
      "pending": 5,
      "cooling": 8,
      "completed": 15,
      "cancelled": 3,
      "rejected": 2
    }
  }
}
```

### 5.3 POST /api/v1/admin/users/:id/deletion/force — 强制注销

**Path 参数**：`:id` → 用户 ID（整数，自动解析）

**请求体**：无

**完整响应枚举**：

| 场景 | HTTP | error | message |
|------|------|-------|---------|
| 强制成功 | 200 | — | "用户已强制注销" |
| 用户不存在 | 404 | USER_NOT_FOUND | "用户不存在" |
| 已注销(跳过) | 200 | — | "用户已强制注销"（幂等处理） |
| 权限不足 | 403 | FORBIDDEN | "权限不足" |

**实现说明**：
- 如果用户已有 cooling 记录 → 直接执行脱敏
- 如果用户无记录 → 先创建一条冷却期记录（coolingDeadline=NOW()），再脱敏
- 如果用户已 status=deleted → 不报错，直接返回成功（幂等）

---

## 6. 定时任务

### 6.1 冷却到期自动注销

**Cron**：`0 * * * *`（每小时第 0 分钟执行）

**SQL**：
```sql
SELECT id, user_id FROM account_deletion_requests
WHERE status = 'cooling' AND cooling_deadline <= NOW() AND cooling_deadline IS NOT NULL;
```

**处理逻辑**：
1. 查出所有到期记录
2. 逐个事务：UPDATE users 脱敏 → UPDATE request status=completed
3. 记录日志

**日志输出格式**：
```
[DeletionCron] 2026-08-03T18:30:00.000Z | scanned=3 processed=3 failed=0 duration=230ms
```

**失败处理**：单个失败不影响其他（for 循环 + try/catch）

---

## 7. Auth 中间件拦截

找到 auth 中间件（`src/middleware/auth.ts` 或类似位置），在 JWT 解析后、路由 handler 执行前插入：

```typescript
// 在 token 验证通过、req.user 赋值之后
const userStatus = req.user.status;

if (userStatus === 'deleted') {
  return reply.code(403).send({
    code: 403,
    error: 'ACCOUNT_DELETED',
    message: '账号已注销，如有疑问请联系客服',
  });
}

if (userStatus === 'deleting') {
  // 白名单：仅允许注销相关 API
  const allowed = ['/api/v1/me/deletion', '/api/v1/me/profile', '/api/v1/logout'];
  const isAllowed = allowed.some(path => req.url.startsWith(path));
  if (!isAllowed) {
    return reply.code(403).send({
      code: 403,
      error: 'ACCOUNT_DELETING',
      message: '账号正在注销中，当前操作已被限制',
    });
  }
}
```

**注意**：users 表的 status 需要支持 `'deleting'`（冷却中）和 `'deleted'`（已注销）两个值。提交注销时设置 `users.status = 'deleting'`，冷却期到设置 `users.status = 'deleted'`。

---

## 8. 错误码与 HTTP 状态码汇总

| HTTP | error_code | 场景 | 触发时机 |
|------|-----------|------|---------|
| 400 | DELETION_CHECKS_FAILED | 注销条件未全通过 | POST /me/deletion |
| 400 | NO_ACTIVE_DELETION | 无活跃申请可撤销/驳回 | DELETE /me/deletion, POST reject |
| 400 | VALIDATION_ERROR | 驳回原因过短/空 | POST reject |
| 403 | ACCOUNT_DELETING | cooling 期调用受限 API | auth 中间件 |
| 403 | ACCOUNT_DELETED | 已注销用户操作 | auth 中间件 |
| 403 | FORBIDDEN | 管理端权限不足 | admin 路由 |
| 404 | NO_DELETION_REQUEST | 用户无注销记录 | GET /me/deletion |
| 404 | USER_NOT_FOUND | 目标用户不存在 | admin 路由 |
| 409 | ACTIVE_DELETION_EXISTS | 重复提交注销 | POST /me/deletion |
