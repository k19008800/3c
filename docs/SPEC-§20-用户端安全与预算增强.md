# 功能说明书：§20 用户端安全与预算增强

> **📖 页面功能说明帮助**
>
> **页面用途**：用户端安全与预算增强 功能说明书。本文档详细定义了该模块各功能点的字段规格、校验规则、边界条件、交互方式和注意事项。
>
> **适用角色**：所有用户、管理员
>
> **核心操作**：
- 配置个人安全设置（2FA/密码策略）
- 管理预算限额和提醒阈值
- 查看安全事件和登录记录
>
> **注意事项**：本 SPEC 文档面向开发者和测试人员，包含字段级定义和校验规则。页面标题旁的 `[?]` 帮助气泡引用本文档内容，点击可查看当前页面功能说明。
>
> **关联组件**：页面标题右侧 `[?]` 帮助按钮，悬停/点击弹出帮助弹窗。




> **对应文档**：`PRD-§20-用户端安全与预算增强.md`
> **关联参考**：`ref-2.2-user-dashboard.md` + `ref-2.2.3-api-keys.md` + `ref-2.2.5-login-history.md` + `ref-2.8-security-center.md`

---

## 总览

本章从用户视角补全 3cloud 平台的安全控制与预算管理能力，涵盖了企业客户最迫切需要的消费预算熔断、全链路的双因素认证、设备级会话管理、API Key 细粒度权限控制，以及前端登录异常检测展示。

| 模块 | 优先级 | 核心价值 |
|------|--------|---------|
| 20.1 用户消费预算设置 | P0 | 防止意外超支，企业客户刚需 |
| 20.2 双因素认证（2FA） | P0 | 增强账户安全，满足合规要求 |
| 20.3 设备管理 | P1 | 会话级安全控制，防范盗用 |
| 20.4 API Key 权限控制（用户侧）| P1 | Key 级安全策略，最小权限原则 |
| 20.5 登录异常检测前端展示 | P1 | 后端能力前端化，用户感知安全状态 |

---

## 20.1 用户消费预算设置（月度消费预算/熔断）

### 功能描述

用户在控制台 `/console/budget` 设置月度消费预算上限，超出后系统自动熔断（停止该用户所有 API Key 的调用），防止意外超支。这是企业客户最刚需的功能：每个部门将 API 消费控制在部门预算内，既避免了超额账单，又能灵活管理调用量。

系统支持三层预算控制机制：

- **月预算**（核心）：自然月消费上限，每月 1 日 00:00:00 自动重置
- **日预算**（辅助）：单日消费上限，支持用户可选开启
- **预算类型**：软上限（仅预警通知，不阻断调用） vs 硬上限（超限立即熔断）

### 完成能力 / 展示效果

**用户端——预算设置页 `/console/budget`：**

1. **预算设置表单 `BudgetSettingsForm.tsx`**
   - 月预算金额输入框（数值，最小 ¥10，步进 ¥100）→ 输入 0 表示不限制
   - 日预算金额输入框（默认 0 = 关闭日预算）
   - 预算类型选择器：`hard`（硬上限熔断）/ `soft`（仅预警通知）
   - 是否启用自动熔断开关：开启时超限自动禁用 Key；关闭时仅预留告警
   - 预警阈值多选：勾选 50%、80%、90% + 可添加自定义百分比（如 70%）
   - 返回实时计算结果：`"您当前月消费 ¥X，设置预算 ¥Y，已使用 Z%"`
   - 保存按钮 → 调用 `PUT /api/v1/me/budget/settings` → 后端即时校验：
     - 若降低预算且当前消费 > 新预算 → 弹出二次确认："当前消费已超过新预算上限，保存后将立即触发熔断，所有 API Key 将无法调用，是否继续？"
     - 确认后立即执行熔断
   - 熔断豁免 Key 选择器：多选列表展示用户所有 Key（名称 + 前缀），选定后可不受熔断限制

2. **仪表盘预算状态卡片 `BudgetStatusCard.tsx`**
   - 所在位置：用户仪表盘 `/console` 第 11 区域（成本预测卡片位置，取代或增强现有区域）
   - 进度条动画展示当月消费 / 月预算，颜色三段变化：
     - 绿色（0%-50%）：正常
     - 橙色（50%-80%）：预警
     - 红色（80%-100%）：危险
   - 左侧展示已用金额（实数字 + 进度百分比），右侧展示预算总额
   - 下方展示日预算使用进度（如有设置）+ 剩余自然天数
   - 熔断状态标签：
     - 正常时显示绿色 `● 运行中`
     - 软上限超额时显示黄色 `● 预算超限（仍需管控）`
     - 硬上限熔断时显示红色 `● 已熔断`，并展示"解除熔断"按钮
   - 预估本月消费（基于当前日均消费估算）：
     - 灰色小字展示 "预估本月消费 ¥XXX（按日均 ¥XX 计算）"
     - 若预估超预算则标注 `⚠ 可能超预算`

3. **解除熔断流程**
   - 用户点击"解除熔断"按钮 → 弹窗说明三种解除方式：
     a. 调高预算（输入新预算值并确认）
     b. 关闭熔断功能（切换为软上限模式）
     c. 等待下月自动重置
   - 选项 a/b 操作后 → `POST /api/v1/me/budget/unblock` → 后端更新状态 → 记录操作日志
   - 解除后即时生效 → Key 恢复可用

**管理员端——预算管理页 `/admin/budget`：**

1. **管理员预算列表 `AdminBudgetList.tsx`**
   - 表格列：用户 ID、用户名/邮箱、月预算、已消费、消费占比（进度条）、预算类型、熔断状态、最后修改时间
   - 搜索框：按用户名/邮箱搜索
   - 筛选：熔断状态（全部/正常/已熔断）、预算类型（hard/soft）
   - 分页：每页 20 条
   - 点击某行 → 弹出修改弹窗：可强制修改月预算 / 日预算 / 预算类型 / 预警阈值 / 熔断开关
   - 修改后调用 `PUT /api/v1/admin/budgets/:userId` → 记录 operatorId → 写入操作日志

2. **熔断历史 `BudgetBlockHistory.tsx`**
   - 表格列：用户、操作类型（熔断/解除/自动解除）、原因、操作人、时间
   - 筛选：按操作类型、时间范围
   - 导出按钮：导出 CSV

3. **平台默认预算设置**
   - 管理员输入默认月预算金额 → `POST /api/v1/admin/budgets/default`
   - 保存到 `site_configs` 表 → 新用户注册时自动创建 `user_budget_settings` 记录
   - 展示现行默认值 + 修改历史

### 数据表结构

```typescript
// user_budget_settings — 用户预算设置
export const userBudgetSettings = pgTable("user_budget_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  monthlyBudget: numeric("monthly_budget", { precision: 18, scale: 2 }).default("0"),
  dailyBudget: numeric("daily_budget", { precision: 18, scale: 2 }).default("0"),
  budgetType: varchar("budget_type", { length: 10 }).notNull().default("hard"),
  alertThresholds: varchar("alert_thresholds", { length: 50 }).default("80"),
  exemptKeys: text("exempt_keys").default(""),
  autoBlock: boolean("auto_block").notNull().default(true),
  currentMonthSpent: numeric("current_month_spent", { precision: 18, scale: 2 }).default("0"),
  currentDaySpent: numeric("current_day_spent", { precision: 18, scale: 2 }).default("0"),
  periodStart: date("period_start"),
  blocked: boolean("blocked").notNull().default(false),
  blockedAt: timestamp("blocked_at"),
  lastAlertedAt: integer("last_alerted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// budget_alert_logs — 预算预警日志
export const budgetAlertLogs = pgTable("budget_alert_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  budgetSettingsId: integer("budget_settings_id").notNull(),
  threshold: integer("threshold").notNull(),
  currentSpent: numeric("current_spent", { precision: 18, scale: 2 }),
  monthlyBudget: numeric("monthly_budget", { precision: 18, scale: 2 }),
  alertChannel: varchar("alert_channel", { length: 20 }).default("both"),
  alertedAt: timestamp("alerted_at").defaultNow(),
});

// budget_block_logs — 熔断日志
export const budgetBlockLogs = pgTable("budget_block_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  budgetSettingsId: integer("budget_settings_id").notNull(),
  action: varchar("action", { length: 20 }).notNull(),
  reason: text("reason"),
  operatorId: integer("operator_id"),
  previousMonthlyBudget: numeric("previous_monthly_budget", { precision: 18, scale: 2 }),
  newMonthlyBudget: numeric("new_monthly_budget", { precision: 18, scale: 2 }),
  operatedAt: timestamp("operated_at").defaultNow(),
});
```

### API 接口

**用户端：**

| 方法 | 路径 | 说明 | 请求体 / 参数 | 响应 |
|------|------|------|-------------|------|
| `GET` | `/api/v1/me/budget/settings` | 获取我的预算设置 | — | `UserBudgetSettings` 对象 |
| `PUT` | `/api/v1/me/budget/settings` | 更新我的预算设置 | `{ monthlyBudget, dailyBudget, budgetType, alertThresholds, exemptKeys, autoBlock }` | 更新后的 `UserBudgetSettings` |
| `POST` | `/api/v1/me/budget/unblock` | 手动解除熔断 | `{ action: "raise_budget" \| "disable_block" \| "wait_reset", newBudget?: number }` | `{ success: true }` |
| `GET` | `/api/v1/me/budget/status` | 当前预算状态 | — | `{ monthlyBudget, currentMonthSpent, spentPercent, dailyBudget, currentDaySpent, blocked, blockedAt, remainingDays, estimatedMonthSpent }` |
| `GET` | `/api/v1/me/budget/alerts` | 我的预警历史 | `?page=1&limit=20` | 分页预警日志列表 |

**管理员端：**

| 方法 | 路径 | 说明 | 请求体 / 参数 | 响应 |
|------|------|------|-------------|------|
| `GET` | `/api/v1/admin/budgets` | 所有用户预算列表 | `?page=1&limit=20&search=xxx&status=blocked&type=hard` | 分页预算列表 |
| `GET` | `/api/v1/admin/budgets/:userId` | 查看指定用户预算 | — | `UserBudgetSettings` + 最近 10 条修改日志 |
| `PUT` | `/api/v1/admin/budgets/:userId` | 管理员修改用户预算 | 同用户端 PUT 参数 | 更新后的 `UserBudgetSettings` |
| `GET` | `/api/v1/admin/budgets/block-logs` | 熔断历史 | `?page=1&limit=20&userId=xxx&action=blocked` | 分页熔断日志列表 |
| `POST` | `/api/v1/admin/budgets/default` | 设置平台默认预算 | `{ monthlyBudget, dailyBudget, budgetType, alertThresholds }` | `{ success: true }` |

### 消费控制引擎（后端核心逻辑）

```
API 请求到达 →
  ┌─ 1. 用户认证 ─→ 获取 userId
  ├─ 2. 路由选择 ─→ 确定 model 和预估费用
  └─ 3. 预算检查（在路由选择之后、转发给供应商之前，优先于限流检查）：
       │
       ├─ 3.1 查询 user_budget_settings WHERE userId = ?
       │      └─ 该用户不存在预算记录 ─→ 跳过检查，继续流程
       │
       ├─ 3.2 检查熔断状态 blocked
       │      └─ true ─→ 检查请求使用的 Key 是否在 exemptKeys 中
       │              ├─ 在豁免列表 ─→ 继续流程
       │              └─ 不在豁免列表 ─→ 返回 403 { error: { code: "QUOTA_EXCEEDED" } }
       │
       ├─ 3.3 估算本次调用的最大费用
       │      └─ 模型价格 × max_tokens / 1000（按最大输出估算）
       │
       ├─ 3.4 日预算检查（dailyBudget > 0 时触发）
       │      └─ (currentDaySpent + 预估费用) >= dailyBudget
       │         └─ 返回 403 { error: { code: "DAILY_QUOTA_EXCEEDED" } }
       │
       ├─ 3.5 月预算检查（monthlyBudget > 0 时触发）
       │      │
       │      ├─ 计算触达百分比：(currentMonthSpent / monthlyBudget) * 100
       │      │
       │      ├─ [预警] 百分比 >= 某个预警阈值 且 该阈值尚未触发过
       │      │   ├─ 写入 budget_alert_logs
       │      │   ├─ 更新 lastAlertedAt = 当前百分比
       │      │   ├─ 发送站内通知（消息类型：budget_alert）
       │      │   ├─ 发送邮件通知
       │      │   └─ 如果是软上限：记录预警但继续放行
       │      │
       │      ├─ [熔断] (currentMonthSpent + 预估费用) >= monthlyBudget 且 budgetType = "hard"
       │      │   ├─ 原子操作（Redis INCRBY + Lua 脚本防止并发超限）
       │      │   ├─ 设 blocked = true, blockedAt = NOW()
       │      │   ├─ 写入 budget_block_logs（action = "blocked"）
       │      │   ├─ 发送站内通知（消息类型：budget_blocked）
       │      │   ├─ 发送邮件通知
       │      │   └─ 返回 403 { error: { code: "QUOTA_EXCEEDED", message: "月度消费预算已用尽" } }
       │      │
       │      └─ 放行 ─→ 继续路由/转发
       │
       └─ 4. 调用完成后扣费（异步或同步）
              ├─ Redis INCRBY currentMonthSpent
              ├─ Redis INCRBY currentDaySpent
              └─ 定期刷入 PostgreSQL（每秒批量写回）
```

**定时任务（每日 00:00:00）：**

```
任务 1：日预算重置
  └─ UPDATE user_budget_settings SET currentDaySpent = 0

任务 2：月预算重置（仅在每月 1 日执行）
  └─ SELECT id, userId FROM user_budget_settings WHERE EXTRACT(DAY FROM NOW()) = 1 AND blocked = true
  └─ FOR EACH: INSERT budget_block_logs (action="auto_unblocked", reason="月预算周期重置")
  └─ UPDATE user_budget_settings SET currentMonthSpent = 0, blocked = false, blockedAt = NULL, periodStart = TODAY
```

### 前端组件 Props

**`BudgetSettingsForm.tsx`**

```typescript
interface BudgetSettingsFormProps {
  initialSettings: UserBudgetSettings;
  availableKeys: Array<{ id: number; name: string; prefix: string }>;
  onSave: (settings: BudgetSettingsPayload) => Promise<void>;
  saving: boolean;
}
```

**`BudgetStatusCard.tsx`**

```typescript
interface BudgetStatusCardProps {
  settings: UserBudgetSettings | null;
  status: BudgetStatus;
  onUnblock: () => void;
  loading: boolean;
}

interface BudgetStatus {
  monthlyBudget: number;
  currentMonthSpent: number;
  spentPercent: number;
  dailyBudget: number;
  currentDaySpent: number;
  dailyPercent: number;
  blocked: boolean;
  blockedAt: string | null;
  remainingDays: number;
  estimatedMonthSpent: number;
}
```

**`AdminBudgetList.tsx`**

```typescript
interface AdminBudgetListProps {
  // 通过路由参数自行获取，无需外部传参
}
```

**`BudgetBlockHistory.tsx`**

```typescript
interface BudgetBlockHistoryProps {
  userId?: number; // 可选，传入则只显示该用户的熔断历史
}
```

### 上下游关系

```
上游：
  call_logs 表 → 每次 API 调用的实际费用 → 反写 currentMonthSpent / currentDaySpent
  users 表 → userId（1:1 关联 user_budget_settings）
  api_keys 表 → exemptKeys 豁免列表
  site_configs 表 → 平台默认预算设置

下游：
  预算控制引擎 → API Gateway 中间件 → 拦截请求 → 返回 403
  预警通知 → notification 服务 → 站内通知 + 邮件
  熔断记录 → budget_block_logs → 管理后台展示 + 用户可见历史
  操作日志 → operation_logs → 审计留痕
```

### 边界条件

| 场景 | 行为 |
|------|------|
| 预算金额为 0 | 不限制，跳过所有预算检查（预算控制中间件直接返回 next） |
| 预算周期重置 | 每月 1 日 00:00:00 自动重置 `currentMonthSpent = 0`, `blocked = false`，`periodStart = 当月1日` |
| 多 Key 并发请求 | Redis Lua 脚本原子操作：`INCRBY + 阈值检查` 一体执行，杜绝超限 |
| 降低预算且消费已超新预算 | 前端二次确认 → 后端立即 SET blocked=true → 记录熔断日志 → 发送通知 |
| 管理员豁免 Key | 路由引擎在 blocked=true 时检查请求 Key 是否在 `exemptKeys` 中 → 在则跳过预算检查 |
| 熔断后仍收到请求 | 每次请求检查 blocked 字段，已熔断则返回 403 QUOTA_EXCEEDED，不额外写入日志 |
| 预警去重 | `lastAlertedAt` 字段存储已触发的最高百分比阈值 → 仅当新阈值 > lastAlertedAt 时触发通知 |
| 无预算记录 | 用户从未设置预算 → 首次进入预算设置页时自动创建 `user_budget_settings` 记录（使用平台默认值） |
| 并发修改预算 | `SELECT ... FOR UPDATE` 行锁 → 串行化修改操作 |
| 超大数值 | monthlyBudget 使用 numeric(18,2)，最大支持 9.9 亿精度两位小数 |

### 验收标准

#### □ 流程图一致性校验 — 与对应流程图对比验证流程分支、异常处理、决策节点完全一致

| # | 验收场景 | 预期结果 |
|---|---------|---------|
| 1 | 用户设置月预算 ¥500、类型 hard、开启 autoBlock | 消费满 ¥500 后，下一次 API 调用返回 `403 QUOTA_EXCEEDED` |
| 2 | 用户关闭 autoBlock | 超过预算后仍可正常调用 API |
| 3 | 预警阈值 80%，月预算 ¥500 | 消费到 ¥400 时收到站内信 + 邮件通知 |
| 4 | 管理员后台手动解除用户熔断 | 用户恢复调用，`budget_block_logs` 记录 `unblocked` 操作 |
| 5 | 下月 1 日 00:00:00 | `currentMonthSpent` 归零，`blocked` 重置为 false，`budget_block_logs` 记录 `auto_unblocked` |
| 6 | 新用户注册 | `user_budget_settings` 自动创建，应用平台默认预算值 |
| 7 | 用户修改预警阈值从 80% 改为 50%+80%+90% | 保存成功，后续按新阈值触发预警 |
| 8 | 管理员将某 Key 加入豁免列表 | 该 Key 在熔断状态下仍可正常调用 |
| 9 | 用户设置日预算 ¥100，已消费 ¥95 | 下一次 API 调用预估 ¥10 → 返回 `403 DAILY_QUOTA_EXCEEDED` |
| 10 | 5 个 Key 同时并发请求，在熔断边界消费 | Redis Lua 原子操作保证不超限，总消费 ≤ 月预算 |

---

## 20.2 双因素认证（2FA）

> 🧩 **与敏感操作二次确认的关系**：2FA 验证身份（"我是本人"），二次确认验证意图（"我确认要操作"）。两者为 AND 关系。
>
> **分层规则**：
> - 登录 / 查看敏感信息 → 只需 2FA
> - 写操作（余额调整/提现审核/补单等）→ 2FA + 二次确认弹窗
>
> **两级开关（系统 × 用户 = AND）**：
> | 系统策略 | 说明 | 用户侧 | 组合效果 |
> |---------|------|--------|---------|
> | `disabled` | 关闭 | 不可见 | 无 2FA |
> | `voluntary` | 用户可选 | 可开启/关闭 | 用户开启才生效 |
> | `mandatory_admin` | 管理员强制 | 仅管理员可关闭 | 管理员强制，用户不可关闭 |
> | `mandatory_all` | 全员强制 | 不可关闭 | 全平台强制 2FA |
>
> 系统策略和用户开关同时开启（AND）才真正生效。

### 功能描述

支持 TOTP（Time-based One-Time Password）标准双因素认证，增强账户安全。基于 RFC 6238 标准，兼容所有主流 Authenticator 应用（Google Authenticator、Microsoft Authenticator、Authy、1Password 等）。管理员可通过后台配置 2FA 策略（关闭/可选/可选推荐/强制/按角色强制），用户可以自主启用或按策略要求强制执行。

### 完成能力 / 展示效果

**管理员端——2FA 策略配置 `/admin/settings/security`：**

1. **策略设置**
   - 下拉选择 2FA 策略：
     - `disabled`：全局不启用，用户端不展示任何 2FA 相关入口
     - `optional`：用户可以自行选择启用/禁用（默认关闭，不打扰用户）
     - `optional_recommended`：用户登录后顶部展示横幅 "建议开启双因素认证保护您的账户安全"
     - `enforced`：所有用户必须启用，登录后直接跳转到 2FA 设置页，不设置则无法使用平台
     - `role_enforced`：按角色强制 → 需额外选择强制角色列表（如 admin、finance、super_admin）
   - "例外角色"选择器（仅在 enforced 模式生效）：选择免于强制启用的角色列表
   - 保存策略 → `PUT /api/v1/admin/2fa/policy` → 即时生效

2. **用户 2FA 状态总览 `AdminTwoFactorPage.tsx`**
   - 表格列：用户ID、邮箱、用户名、角色、2FA 状态（已启用/未启用）、启用时间、是否强制重置中
   - 搜索：按邮箱/用户名
   - 筛选：2FA 状态（全部/已启用/未启用/锁定中）
   - 操作列：强制重置按钮（红色，需二次确认："确认后将清空该用户所有 2FA 配置和恢复码，用户下次登录需重新设置"）
   - 批量操作：勾选 → 批量强制重置

3. **2FA 操作日志**
   - 展示所有 2FA 相关操作：启用、禁用、重置、恢复码使用、登录锁定
   - 列：时间、用户、操作类型、详情、操作 IP

**用户端——2FA 设置 `/console/security/2fa`：**

1. **2FA 状态展示 `TwoFactorStatus.tsx`**
   - 未启用状态：
     - 卡片展示 "双因素认证未启用" + 灰色盾牌图标
     - "启用"按钮（蓝色主色）
     - 若管理员配置为 `enforced` 或用户角色在强制列表中 → 卡片顶部红字 "管理员要求必须启用双因素认证"
   - 已启用状态：
     - 卡片展示 "双因素认证已启用" + 绿色盾牌图标 ✓
     - 显示启用时间
     - "禁用"按钮（灰色，需验证当前 2FA 验证码）
     - "重新生成恢复码"按钮（需验证当前 2FA 验证码）

2. **启用流程 `TwoFactorSetup.tsx`**
   ```
   步骤 1：准备启用
     ├─ 页面展示说明文字："请使用 Authenticator 应用扫描以下二维码"
     ├─ 展示二维码（通过 `/api/v1/auth/2fa/setup` 获取，内嵌 `otpauth://` 协议 URI）
     │   ├─ 实验室参数：TOTP / SHA1 / 30s 步长 / 6 位数字
     │   └─ 示例 URI：otpauth://totp/3cloud:user@example.com?secret=XXXX&issuer=3cloud&algorithm=SHA1&digits=6&period=30
     ├─ 二维码下方展示手动密钥（Base32 编码，32 字符）→ 带复制按钮
     └─ "下一步"按钮

   步骤 2：验证验证码
     ├─ 展示 6 位数字输入框（自动聚焦 + 自动提交）
     ├─ 用户输入 → 自动调用 POST /api/v1/auth/2fa/verify
     ├─ 验证成功 → 进入步骤 3
     ├─ 验证失败 → 红色提示"验证码错误，请确认时间同步正确后重试" + 输入框清空
     └─ 连续 5 次失败 → 锁定 60 秒 → 倒计时展示

   步骤 3：保存恢复码 `RecoveryCodesDisplay.tsx`
     ├─ 展示 10 个一次性恢复码（每组 8 位字母数字混合物，如 "A3KF-9XM2-WQ4P-R7TN"）
     ├─ 从上到下排列，每个一行，深色背景显示
     ├─ 按钮：
     │   ├─ "复制全部"→ 将 10 个码拼接为文本复制到剪贴板
     │   ├─ "下载 TXT"→ 生成 .txt 文件并触发下载
     │   └─ "打印"→ 调起浏览器打印窗口
     ├─ 警告文字："请立即保存恢复码！此页面关闭后无法再次查看。恢复码可用于在您丢失手机时登录账户。"
     └─ 勾选框 "我已安全保存恢复码" ← 必须勾选才能点击"完成"
   ```

3. **禁用流程**
   ```
   步骤 1：安全确认
     ├─ 弹窗标题"禁用双因素认证"
     ├─ 警告文字："禁用后账户安全性将降低，任何获取您密码的人都可以登录。"
     └─ 输入框：6 位 2FA 验证码

   步骤 2：验证
     ├─ POST /api/v1/auth/2fa/disable（附带验证码）
     ├─ 验证通过 → 禁用成功 → 卡片变回"未启用"状态
     └─ 验证失败 → 提示"验证码错误"
   ```

4. **重新生成恢复码**
   ```
   ├─ 输入当前 2FA 验证码
   ├─ POST /api/v1/auth/2fa/recovery-codes
   ├─ 后端：旧恢复码全部作废（UPDATE user_recovery_codes SET used = true WHERE userId = ? AND used = false）
   ├─ 生成新批次 10 个码
   └─ 展示 RecoveryCodesDisplay — 同步骤 3
   ```

**用户端——登录 2FA 验证 `TwoFactorLogin.tsx`：**

```
步骤 1：密码验证
  ├─ 用户输入邮箱 + 密码 → POST /api/v1/auth/login
  ├─ 密码验证通过 → 后端检查用户 2FA 状态
  │   ├─ 2FA 未启用 → 直接颁发 JWT → 登录成功 → 跳转控制台
  │   ├─ 2FA 已启用 且 当前设备在信任设备列表 → 查 session_trusted_devices → 直接登录
  │   └─ 2FA 已启用 且 非信任设备 → 返回临时 token（5 分钟有效）→ 前端跳转到 2FA 验证页面
  └─ 密码验证失败 → 提示"邮箱或密码错误"

步骤 2：2FA 验证页
  ├─ 页面居中展示 6 位数字输入框
  ├─ 辅助入口："无法使用认证器？使用恢复码"
  ├─ "信任此设备 30 天"勾选框
  │
  ├─ 输入 TOTP 验证码 → 自动提交 POST /api/v1/auth/2fa/login
  │   ├─ 验证通过 → 颁发 JWT → 信任设备 → 登录成功
  │   └─ 验证失败 → 红色提示 + 输入框抖动 + 失败计数 +1
  │       └─ 连续 5 次失败 → 锁定 15 分钟
  │           ├─ twoFactorLockedUntil = NOW() + 15min
  │           ├─ 前端锁定倒计时 15:00
  │           ├─ 站内通知 + 邮件告警该账户可能有未授权访问
  │           └─ 锁定期间所有 2FA 验证请求返回 429
  │
  └─ 点击"使用恢复码" → 切换为恢复码输入框（格式 "XXXX-XXXX-XXXX-XXXX"）
      ├─ POST /api/v1/auth/2fa/login（附带 recoveryCode）
      ├─ bcrypt 比对 → 标记该恢复码 used=true, usedAt=now
      ├─ 登录成功 → 颁发 JWT
      └─ 无效恢复码 → 提示"恢复码无效或已使用"（也计入失败次数）
```

**管理员端——强制重置流程：**

```
管理员点击"强制重置" → 二次确认 → POST /api/v1/admin/2fa/reset/:userId
  ├─ 后端操作：
  │   ├─ UPDATE users SET twoFactorEnabled=false, twoFactorSecret=NULL, twoFactorVerified=false
  │   ├─ UPDATE user_recovery_codes SET used=true WHERE userId=?
  │   └─ 记录操作日志
  ├─ 管理员端提示"重置成功，该用户下次登录将提示重新设置 2FA"
  └─ 用户端：2FA 状态重置为"未启用，管理员要求重新设置"
```

### 数据表结构

```typescript
// users 表新增字段
export const users = pgTable("users", {
  // ... 现有字段
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  twoFactorSecret: varchar("two_factor_secret", { length: 100 }),      // AES-256 加密存储
  twoFactorVerified: boolean("two_factor_verified").notNull().default(false),
  twoFactorEnabledAt: timestamp("two_factor_enabled_at"),
  twoFactorLockedUntil: timestamp("two_factor_locked_until"),
  twoFactorFailedAttempts: integer("two_factor_failed_attempts").default(0),
});

// user_recovery_codes — 恢复码
export const userRecoveryCodes = pgTable("user_recovery_codes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  code: varchar("code", { length: 120 }).notNull(),      // bcrypt 哈希
  used: boolean("used").notNull().default(false),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// session_trusted_devices — 信任设备
export const sessionTrustedDevices = pgTable("session_trusted_devices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  deviceFingerprint: varchar("device_fingerprint", { length: 64 }).notNull(),
  trustedUntil: timestamp("trusted_until").notNull(),    // 默认 30 天
  createdAt: timestamp("created_at").defaultNow(),
});
// 唯一约束：(userId, deviceFingerprint)

// site_configs 新增配置项
// two_factor_policy: 'disabled' | 'optional' | 'optional_recommended' | 'enforced' | 'role_enforced'
// two_factor_enforced_roles: JSON array ['admin', 'finance']
// two_factor_exempt_roles: JSON array []
// two_factor_lock_threshold: 5          — 连续失败次数阈值
// two_factor_lock_duration_minutes: 15  — 锁定分钟数
// two_factor_trust_device_days: 30      — 信任设备有效天数
```

### API 接口

**认证相关（无需登录态，使用临时 token）：**

| 方法 | 路径 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| `POST` | `/api/v1/auth/2fa/login` | 2FA 登录验证 | `{ tempToken, code, recoveryCode?, trustDevice? }` | `{ accessToken, refreshToken, user }` |

**用户端（需登录态）：**

| 方法 | 路径 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| `POST` | `/api/v1/auth/2fa/setup` | 获取 2FA 设置信息 | — | `{ secret, qrCodeUrl, manualKey }` |
| `POST` | `/api/v1/auth/2fa/verify` | 验证 TOTP 验证码，完成启用 | `{ code }` | `{ success: true, recoveryCodes: string[] }` |
| `POST` | `/api/v1/auth/2fa/disable` | 禁用 2FA | `{ code }` | `{ success: true }` |
| `POST` | `/api/v1/auth/2fa/recovery-codes` | 重新生成恢复码 | `{ code }` | `{ recoveryCodes: string[] }` |
| `GET` | `/api/v1/auth/2fa/status` | 获取 2FA 状态 | — | `{ enabled, verified, enabledAt, hasRecoveryCodes, remainingRecoveryCodes }` |

**管理员端：**

| 方法 | 路径 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| `GET` | `/api/v1/admin/2fa/status` | 所有用户 2FA 状态 | `?page&limit&search&status` | 分页 2FA 状态列表 |
| `POST` | `/api/v1/admin/2fa/reset/:userId` | 强制重置用户 2FA | — | `{ success: true }` |
| `PUT` | `/api/v1/admin/2fa/policy` | 设置 2FA 策略 | `{ policy, enforcedRoles?, exemptRoles? }` | `{ success: true, policy }` |
| `GET` | `/api/v1/admin/2fa/logs` | 2FA 操作日志 | `?page&limit&userId&action` | 分页操作日志 |

### 前端组件 Props

**`TwoFactorSetup.tsx`**

```typescript
interface TwoFactorSetupProps {
  setupData: {
    secret: string;
    qrCodeUrl: string;
    manualKey: string;
  };
  onVerify: (code: string) => Promise<{ recoveryCodes: string[] }>;
  verifying: boolean;
  error: string | null;
}
```

**`TwoFactorLogin.tsx`**

```typescript
interface TwoFactorLoginProps {
  tempToken: string;
  onComplete: (tokens: { accessToken: string; refreshToken: string }) => void;
}
```

**`TwoFactorStatus.tsx`**

```typescript
interface TwoFactorStatusProps {
  status: {
    enabled: boolean;
    verified: boolean;
    enabledAt: string | null;
    hasRecoveryCodes: boolean;
    remainingRecoveryCodes: number;
  };
  onEnable: () => void;
  onDisable: () => void;
  onRegenerateCodes: () => void;
}
```

**`RecoveryCodesDisplay.tsx`**

```typescript
interface RecoveryCodesDisplayProps {
  codes: string[];
  onConfirm: () => void;
  oneTime: boolean; // true = 首次展示（不可返回查看），false = 重新生成后可重复查看
}
```

**`AdminTwoFactorPage.tsx`**

```typescript
interface AdminTwoFactorPageProps {
  // 自行从路由获取数据
}
```

### 上下游关系

```
上游：
  users 表 → 2FA 启用状态 + TOTP 密钥
  site_configs 表 → 2FA 策略配置
  登录流程 → 密码验证通过 → 触发 2FA 验证

下游：
  认证中间件 → 根据 tempToken 验证 2FA → 颁发 JWT
  TOTP 库（otplib/speakeasy）→ 生成/验证动态码
  通知服务 → 2FA 锁定告警 → 站内通知 + 邮件
  操作审计 → operation_logs 记录所有 2FA 操作

跨服务：
  ┌──────────────┐     ┌───────────────┐     ┌──────────────┐
  │  auth 服务   │────→│ TOTP 验证引擎  │────→│ users 表     │
  │ /login       │     │ otplib.verify  │     │ 2FA 字段     │
  │ /2fa/*       │     │                │     │              │
  └──────────────┘     └───────────────┘     └──────────────┘
        │                                            │
        └────── 登录成功 ─→ 颁发 JWT ─→ 存入 Redis ─┘
```

### 边界条件

| 场景 | 行为 |
|------|------|
| 2FA 密钥存储 | AES-256-GCM 加密存储，密钥由环境变量 `APP_ENCRYPTION_KEY` 提供，不在日志中记录 |
| 恢复码存储 | bcrypt 哈希存储（cost factor 10），原始码仅在生成时一次性返回前端 |
| 时间偏差 | TOTP 验证时接受 ±1 个时间步长（默认窗口 = ±30 秒），防止用户手机时间偏差 |
| 锁定机制 | 5 次失败 → 锁定 15 分钟 → `twoFactorLockedUntil = NOW()+15min` → 锁定期间返回 429 |
| 锁定后重置失败计数 | 锁定时间结束后，下一次验证自动清零 `twoFactorFailedAttempts` |
| 信任设备 | 基于设备指纹哈希 + userId 唯一约束 → 30 天内跳过 2FA |
| 管理员重置 | 清空 `twoFactorSecret` + `twoFactorEnabled=false` + 全部恢复码作废 |
| 强制启用 | enforced 模式下，登录成功后检查 2FA 状态 → 未启用则重定向到设置页，拒绝访问其他路由 |
| 角色强制 | 用户角色变更时（如从 user 升为 admin），下次登录时自动触发 2FA 设置要求 |
| 同一用户多次 setup | 每次调用 POST /setup 生成新 secret → 旧 secret 失效（覆盖） |
| 恢复码用尽 | 用户通过 2FA 认证后可以点击"重新生成恢复码" → 旧批作废 → 新批生成 10 个 |
| 2FA 禁用后遗症 | 禁用后用户的所有恢复码作废（used=true），若重新启用则须走完整 setup 流程 |

### 验收标准

| # | 验收场景 | 预期结果 |
|---|---------|---------|
| 1 | 管理员设置 2FA 策略为 `enforced` | 未启用的用户登录后自动跳转到 2FA 设置页，无法访问其他页面 |
| 2 | 管理员设置 2FA 策略为 `optional` | 用户在安全中心可看到 2FA 入口，可以自由启用/禁用 |
| 3 | 用户启用 2FA 完整流程 | 扫码 → 输入验证码 → 验证通过 → 展示 10 个恢复码 → 勾选已保存 → 完成 |
| 4 | 登录时输入正确 TOTP 验证码 | 密码验证 → 2FA 验证页 → 输入 6 位码 → 登录成功 → 进入控制台 |
| 5 | 登录时使用有效恢复码 | 密码验证 → 点击"使用恢复码" → 输入 A3KF-9XM2-WQ4P-R7TN → 登录成功 → 该恢复码标记已使用 |
| 6 | 连续 5 次 TOTP 验证失败 | 账户锁定 15 分钟 → 前端显示倒计时 → 站内信 + 邮件告警 |
| 7 | 管理员强制重置用户 2FA | 用户恢复码全部作废 → 用户下次登录提示需要重新设置 2FA |
| 8 | 信任设备 30 天 | 首次 2FA 登录时勾选"信任" → 30 天内该设备登录无需 2FA |
| 9 | 管理员设置角色强制（仅 admin 角色需要 2FA） | admin 用户登录后强制设置 2FA，普通用户正常进入 |
| 10 | 恢复码用尽后重新生成 | 输入 2FA 验证码 → 旧恢复码全部作废 → 生成 10 个新恢复码 |

---

## 20.3 设备管理

### 功能描述

用户在安全中心 `/console/security/devices` 查看自己所有已登录设备列表，包括设备详情（名称、系统、浏览器、IP、位置、活跃时间），支持远程登出可疑设备，一键登出所有非当前设备。系统自动检测异常设备并标记风险等级（正常/可疑/未知）。管理员可在后台查看指定用户设备并强制登出。

### 完成能力 / 展示效果

**用户端——设备列表页 `/console/security/devices`：**

1. **设备视图切换**
   - 顶部分页切换：`卡片视图` / `列表视图`
   - 列表视图：表格展示（设备图标 + 名称、系统浏览器、IP 位置、首次登录、最近活跃、状态、操作）
   - 卡片视图：每个设备一张卡片

2. **当前设备 `DeviceCard.tsx`（当前设备）**
   - 蓝色边框高亮 + 蓝色标签 `🏷 当前设备`
   - 展示信息：
     - 设备图标（按 deviceType：🖥 桌面 / 📱 移动 / 📲 平板）
     - 设备名称（从 user-agent 解析，如 "Chrome on Windows"）
     - 操作系统 + 浏览器版本
     - IP 地址 + 城市/国家（带小国旗 emoji）
     - "当前会话" ← 标记
     - 最近活跃时间（"刚刚" 或具体时间）
   - 操作按钮："登出"按钮灰色置灰，tooltip 提示"无法登出当前设备"

3. **其他设备列表**
   - 每张卡展示：
     - 设备图标 + 名称
     - 系统 + 浏览器
     - IP + 地理位置
     - 首次登录时间
     - 最近活跃时间（超过 24h 显示"X天前"，超过 7 天显示"X周前"）
     - 风险标签：
       - 🟢 `正常`：常规设备
       - 🟡 `可疑`：自动检测命中规则（如异地登录、非常用 IP）
       - 🔴 `未知`：设备指纹异常
     - 操作按钮：
       - `登出`（红色文字按钮）
       - `标记为可信`（仅可疑/未知设备展示）

4. **登出确认弹窗 `DeviceLogoutConfirm.tsx`**
   - 弹窗标题："确认登出此设备？"
   - 展示设备名称 + 最后活跃时间
   - 说明文字："该设备上的当前会话将立即失效，用户需要重新登录。"
   - 确认按钮：`确认登出` → `POST /api/v1/me/devices/:id/logout`
   - 取消按钮：保留

5. **一键登出所有设备**
   - 页面顶部 `登出所有其他设备` 按钮（红色警示色）
   - 点击 → 弹窗确认："将登出除当前设备外的所有 X 个设备，这些设备上的所有会话将立即失效。"
   - 确认 → `POST /api/v1/me/devices/logout-all`
   - 成功 → 设备列表刷新，仅保留当前设备

6. **设备数量限制**
   - 列表最多展示 50 个设备
   - 超过 50 个 → 底部文字提示 "已展示最近 50 个设备，较早的设备已被自动清理"

**自动检测规则（后端）：**

```
规则 1：异地登录检测
  ├─ 同一用户在 30 分钟内从两个不同城市（距离 > 500km）登录
  └─ → 两个设备均标记 riskLevel = "suspicious"

规则 2：非常用地区登录
  ├─ 从用户过去 90 天内从未登录过的国家/地区登录
  └─ → 标记 riskLevel = "suspicious"

规则 3：设备指纹突变
  ├─ 同一 IP 但浏览器/OS/屏幕分辨率突然变化
  └─ → 标记 riskLevel = "unknown"

规则 4：恶意 IP 库命中
  ├─ 对接外部威胁情报（或内置 IP 信誉库）
  └─ → 标记 riskLevel = "suspicious"
```

**管理员端——设备管理：**

```
用户详情页 → 设备管理 Tab：
  ├─ 展示该用户所有活跃设备（同用户端列表视图）
  ├─ 每行有"强制登出"按钮
  ├─ 强制登出 → POST /api/v1/admin/devices/:id/force-logout
  ├─ 记录操作日志（管理员ID、操作时间、被操作用户）
  └─ 筛选：风险设备仅显示 / 全部设备 / 仅活跃设备
```

### 数据表结构

```typescript
// user_devices — 用户设备
export const userDevices = pgTable("user_devices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  sessionId: varchar("session_id", { length: 64 }),      // 关联 sessions 表
  deviceName: varchar("device_name", { length: 200 }),   // "Chrome on Windows" 等友好名称
  deviceType: varchar("device_type", { length: 50 }),    // 'desktop' | 'mobile' | 'tablet'
  os: varchar("os", { length: 100 }),
  osVersion: varchar("os_version", { length: 50 }),
  browser: varchar("browser", { length: 100 }),
  browserVersion: varchar("browser_version", { length: 50 }),
  userAgent: text("user_agent"),
  ip: varchar("ip", { length: 45 }),
  city: varchar("city", { length: 100 }),
  region: varchar("region", { length: 100 }),
  country: varchar("country", { length: 100 }),
  fingerprint: varchar("fingerprint", { length: 64 }),   // SHA256(UA+OS+screen+gpu+timezone+...)
  firstSeenAt: timestamp("first_seen_at").defaultNow(),
  lastActiveAt: timestamp("last_active_at").defaultNow(),
  isCurrent: boolean("is_current").default(false),
  riskLevel: varchar("risk_level", { length: 20 }).default("normal"),
  riskRule: varchar("risk_rule", { length: 100 }),       // 命中的风控规则名称
  isActive: boolean("is_active").default(true),           // 会话是否活跃
  loggedOutAt: timestamp("logged_out_at"),
  loggedOutBy: varchar("logged_out_by", { length: 50 }),  // 'user' | 'admin' | null
  createdAt: timestamp("created_at").defaultNow(),
});

// 索引：userId + isActive
// 索引：fingerprint
// 每个用户最多保留 50 条 isActive=true 的记录
```

### API 接口

**用户端：**

| 方法 | 路径 | 说明 | 请求体 / 参数 | 响应 |
|------|------|------|-------------|------|
| `GET` | `/api/v1/me/devices` | 我的设备列表 | `?riskLevel=suspicious` | `{ devices: Device[], total }` |
| `POST` | `/api/v1/me/devices/:id/logout` | 登出指定设备 | — | `{ success: true }` |
| `POST` | `/api/v1/me/devices/logout-all` | 登出所有非当前设备 | — | `{ success: true, loggedOutCount }` |
| `POST` | `/api/v1/me/devices/:id/trust` | 标记设备为可信 | — | `{ success: true }` |

**管理员端：**

| 方法 | 路径 | 说明 | 请求体 / 参数 | 响应 |
|------|------|------|-------------|------|
| `GET` | `/api/v1/admin/devices/:userId` | 查看用户设备 | `?riskLevel=filters` | `{ devices: Device[] }` |
| `POST` | `/api/v1/admin/devices/:id/force-logout` | 强制登出 | — | `{ success: true }` |

### 前端组件 Props

**`DeviceList.tsx`**

```typescript
interface DeviceListProps {
  devices: Device[];
  currentDeviceId: number;
  onLogout: (deviceId: number) => Promise<void>;
  onLogoutAll: () => Promise<void>;
  onTrust: (deviceId: number) => Promise<void>;
  loading: boolean;
  viewMode?: 'card' | 'table';
}

interface Device {
  id: number;
  deviceName: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  os: string;
  osVersion: string;
  browser: string;
  browserVersion: string;
  ip: string;
  city: string;
  region: string;
  country: string;
  firstSeenAt: string;
  lastActiveAt: string;
  isCurrent: boolean;
  riskLevel: 'normal' | 'suspicious' | 'unknown';
  isActive: boolean;
}
```

**`DeviceCard.tsx`**

```typescript
interface DeviceCardProps {
  device: Device;
  isCurrent: boolean;
  onLogout: () => void;
  onTrust: () => void;
}
```

**`DeviceLogoutConfirm.tsx`**

```typescript
interface DeviceLogoutConfirmProps {
  open: boolean;
  deviceName: string;
  lastActiveAt: string;
  onConfirm: () => void;
  onCancel: () => void;
}
```

### 上下游关系

```
上游：
  sessions 表 → 活跃会话 → 关联到设备记录
  users 表 → userId
  login_history 表 → 首次登录 → 同步创建设备记录
  request 中间件 → 每次 API 请求 → 更新 lastActiveAt + isCurrent

下游：
  登出操作 → sessions 表 → 失效该设备所有 session
  强制登出 → WebSocket 推送 → 该设备浏览器收到登出通知 → 清除 local storage + 跳转登录页
  IP 地理位置解析 → 调用第三方 GeoIP 库（MaxMind / ipinfo.io）
```

### 边界条件

| 场景 | 行为 |
|------|------|
| 用户试图登出当前设备 | 按钮置灰 → tooltip "无法登出当前设备" → 请求不发出 |
| 登出设备后 session 处理 | 后端在 sessions 表标记该设备下所有 session 为 expired → 该设备下次请求返回 401 |
| 设备指纹隐私 | 不存储原始 user-agent 到 fingerprint 字段，仅存储 SHA256 哈希 |
| 设备列表上限 | 每个用户最多保留 50 条活跃设备记录 → 超过时按 lastActiveAt 排序，删除最旧的 |
| 同一设备多次登录 | 按 fingerprint 去重 → 存在则更新 lastActiveAt + isCurrent，不创建新记录 |
| 管理员强制登出 | 记录 `loggedOutBy = 'admin'` + `loggedOutAt` → 不物理删除记录，标记 isActive=false |
| 地理位置解析失败 | IP 无法解析位置 → city/region/country 显示为 "—" 或 "未知" |
| 设备信息解析依赖 | 使用 `ua-parser-js` 或 `useragent` 库解析 user-agent → 无法解析时显示 "Unknown" |
| 无 sessionId 的设备 | sessionId 可为 null（适用于历史登录记录同步创建的设备） |

### 验收标准

| # | 验收场景 | 预期结果 |
|---|---------|---------|
| 1 | 用户首次登录 | 设备列表中出现当前设备，显示设备名称、IP、位置 |
| 2 | 用户从另一台电脑登录 | 设备列表出现两个设备，型号/系统/浏览器/IP不同 |
| 3 | 用户登出指定设备 | 该设备 isActive=false，该设备下次请求返回 401 |
| 4 | 用户登出所有非当前设备 | 除当前设备外全部 isActive=false |
| 5 | 管理员强制登出用户设备 | 该设备立即退出，用户端看不到该设备 |
| 6 | 异地登录检测 | 从不同城市登录 → 旧设备风险标记"suspicious"，前端卡片黄色 ⚠ |
| 7 | 从非常用国家登录 | 新设备标记"suspicious"，首次关联规则"very_unusual_country" |
| 8 | 用户标记可疑设备为可信 | 风险等级更新为"normal" |
| 9 | 设备超过 50 个上限 | 第 51 个设备创建时，最旧设备标记 isActive=false |
| 10 | 同一设备重复登录 | 更新现有设备记录而非创建新记录 |

---

## 20.4 API Key 权限控制（用户侧，增强）

### 功能描述

在现有 Key 管理基础上（§2.4），扩展用户对单 Key 的细粒度权限控制。用户在创建/编辑 API Key 时可以设置五大权限维度：可访问模型范围、IP 白名单、引用来源限制、每日 Token 额度、速率限制。所有限制在 API 网关中间件层面拦截，Key 权限变更即时生效。

### 完成能力 / 展示效果

**用户端——创建 Key 时的权限配置面板 `KeyPermissionEditor.tsx`：**

```
┌─ Key 基本信息 ─────────────────────────────────┐
│  名称：[____________]                           │
└─────────────────────────────────────────────────┘

┌─ 权限配置（可选，展开/收起） ──────────────────┐
│                                                 │
│  📋 可访问模型                                   │
│  ┌─────────────────────────────────────────┐   │
│  │ 🔍 搜索模型...                           │   │
│  │                                          │   │
│  │ ☑ deepseek-chat          ¥0.001/1K     │   │
│  │ ☑ deepseek-reasoner      ¥0.004/1K     │   │
│  │ ☐ gpt-4o                 ¥0.015/1K     │   │
│  │ ☐ claude-3.5-sonnet      ¥0.003/1K     │   │
│  │ ☐ gemini-2.0-flash       ¥0.0005/1K    │   │
│  └─────────────────────────────────────────┘   │
│  已选 2 个模型 | 空 = 全部可访问                 │
│                                                 │
│  🌐 IP 白名单                                    │
│  ┌─────────────────────────────────────────┐   │
│  │ 192.168.1.0/24                          │   │
│  │ 10.0.0.1                             ✕  │   │
│  └─────────────────────────────────────────┘   │
│  输入 IP 或 CIDR，回车添加 | 空 = 不限制        │
│                                                 │
│  🔗 引用来源限制（Referer / Origin）              │
│  ┌─────────────────────────────────────────┐   │
│  │ example.com                          ✕  │   │
│  │ myapp.io                              ✕  │   │
│  └─────────────────────────────────────────┘   │
│  输入域名，回车添加 | 空 = 不限制                 │
│                                                 │
│  💰 每日 Token 额度                              │
│  [100000____] tokens / 天                       │
│  0 = 不限制（使用账户总配额）                      │
│                                                 │
│  📈 速率限制（每分钟/每天）                       │
│  RPM：[60___] 次/分钟                           │
│  TPM：[100000_] tokens/分钟                     │
│  0 = 不限制（使用账户总限制）                      │
│                                                 │
└─────────────────────────────────────────────────┘

[创建 Key] 按钮
```

**编辑已有 Key 权限：**
- Key 详情页 → "权限" Tab → 展示当前权限配置
- 各权限维度可独立修改，点击保存立即生效
- 修改历史记录：展示最近 10 次权限变更（时间、变更项、变更前后值）

**网关拦截效果：**

```
API 请求使用 Key sk-3c-abc123 调用 gemini-2.0-flash →
  ├─ 1. 解析 Key → 查询 api_keys 表 → 获取权限配置
  ├─ 2. 模型权限检查：
  │      modelPermissions = ["deepseek-chat", "deepseek-reasoner"]
  │      gemini-2.0-flash 不在允许列表 → 返回 403 MODEL_NOT_ALLOWED
  ├─ 3. IP 检查（如果配置了 IP 白名单）：
  │      来源 IP 10.0.0.2 不在 192.168.1.0/24 内 → 返回 403 IP_NOT_ALLOWED
  ├─ 4. 引用来源检查（如果配置了域名限制）：
  │      Referer: evil.com 不在允许列表 → 返回 403 REFERER_NOT_ALLOWED
  ├─ 5. 每日额度检查：
  │      dailyUsed + 预估本次消耗 > dailyLimit → 返回 403 DAILY_LIMIT_EXCEEDED
  └─ 6. 速率限制检查：
         RPM/TPM 超过限制 → 返回 429 RATE_LIMIT_EXCEEDED
```

### 数据表结构

```typescript
// api_keys 表新增字段（在现有 api_keys 表基础上扩展）
export const apiKeys = pgTable("api_keys", {
  // ... 现有字段
  modelPermissions: text("model_permissions"),            // JSON 数组 string[]，空字符串 = 全部可访问
  permissionMode: varchar("permission_mode", { length: 10 }).default("allowlist"), // 'allowlist' | 'blocklist'
  ipWhitelist: text("ip_whitelist"),                      // JSON 数组，如 ["192.168.1.0/24","10.0.0.1"]
  refererRestrictions: text("referer_restrictions"),      // JSON 数组，如 ["example.com","myapp.io"]
  dailyTokenLimit: numeric("daily_token_limit", { precision: 18, scale: 2 }).default("0"),  // 0 = 不限制
  dailyTokensUsed: numeric("daily_tokens_used", { precision: 18, scale: 2 }).default("0"),
  dailyTokensResetAt: timestamp("daily_tokens_reset_at"),
  rpm: integer("rpm").default(0),                         // 0 = 不限制（使用账户总 RPM）
  tpm: integer("tpm").default(0),                         // 0 = 不限制（使用账户总 TPM）
});

// key_permission_changes — Key 权限变更记录
export const keyPermissionChanges = pgTable("key_permission_changes", {
  id: serial("id").primaryKey(),
  keyId: integer("key_id").notNull().references(() => apiKeys.id),
  userId: integer("user_id").notNull().references(() => users.id),
  field: varchar("field", { length: 50 }).notNull(),      // 'modelPermissions' | 'ipWhitelist' | ...
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedAt: timestamp("changed_at").defaultNow(),
});
```

### API 接口

| 方法 | 路径 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| `GET` | `/api/v1/me/api-keys/:id/permissions` | 查看 Key 权限 | — | `ApiKeyPermissions` |
| `PUT` | `/api/v1/me/api-keys/:id/permissions` | 更新 Key 权限 | `{ modelPermissions?, permissionMode?, ipWhitelist?, refererRestrictions?, dailyTokenLimit?, rpm?, tpm? }` | 更新后的 `ApiKeyPermissions` |
| `GET` | `/api/v1/me/api-keys/:id/permissions/history` | Key 权限变更历史 | `?page=1&limit=20` | 分页变更历史 |

### 前端组件 Props

**`KeyPermissionEditor.tsx`**

```typescript
interface KeyPermissionEditorProps {
  keyId?: number;                          // 编辑已有 Key 时传入
  permissions: ApiKeyPermissions;
  availableModels: Model[];                // 平台所有可用模型
  onSave: (permissions: ApiKeyPermissions) => Promise<void>;
  saving: boolean;
}

interface ApiKeyPermissions {
  modelPermissions: string[];              // 空数组 = 全部
  permissionMode: 'allowlist' | 'blocklist';
  ipWhitelist: string[];
  refererRestrictions: string[];
  dailyTokenLimit: number;                 // 0 = 不限制
  dailyTokensUsed: number;
  rpm: number;                             // 0 = 不限制
  tpm: number;                             // 0 = 不限制
}

interface Model {
  id: string;
  name: string;
  provider: string;
  inputPrice: number;
  outputPrice: number;
}
```

### 上下游关系

```
上游：
  models 表 → 可用模型列表 → 模型选择器组件
  api_keys 表 → Key 基础信息 + 权限配置
  users 表 → RPM/TPM 账户总限制

下游：
  API 网关中间件 → 每次 API 请求检查 Key 权限：
    1. 模型权限检查（allow list / block list）
    2. IP 白名单检查（CIDR 匹配）
    3. Referer/Origin 检查（域名精确匹配）
    4. 每日额度检查（Redis 原子计数）
    5. 速率限制检查（滑动窗口算法）
  └─ 任一检查不通过 → 返回对应错误码 → 拦截请求

  key_permission_changes 表 → 操作审计留痕
```

### 边界条件

| 场景 | 行为 |
|------|------|
| modelPermissions 为空 | 该 Key 可访问所有可用模型 |
| IP 白名单为空 | 不限制请求来源 IP |
| IP/CIDR 格式非法 | 前端正则校验 + 后端二次校验 → 返回 400 INVALID_IP_FORMAT |
| modelPermissions 中模型被下线 | 该 Key 不再可调用已下线模型，调用返回 404 MODEL_NOT_FOUND |
| dailyTokenLimit = 0 | 不限制每日 Token 量 |
| 每日额度重置 | 每日 00:00:00 通过定时任务 SET dailyTokensUsed = 0 |
| 权限变更即时生效 | 网关每次请求从数据库实时查询 Key 权限（不做缓存），变更即刻对后续请求生效 |
| allowlist vs blocklist | allowlist：仅允许列表中模型 | blocklist：禁止列表中模型，其余允许 |
| 速率限制与账户总限制 | Key 级别 RPM/TPM 取 Key 设置与账户设置的较小值 |
| 权限变更历史 | 仅保存最近 100 条记录，超过则删除最旧记录 |

### 验收标准

| # | 验收场景 | 预期结果 |
|---|---------|---------|
| 1 | 创建 Key 时设置 modelPermissions = ["deepseek-chat"] | 该 Key 调用 gpt-4o 返回 `403 MODEL_NOT_ALLOWED` |
| 2 | 创建 Key 时设置 ipWhitelist = ["192.168.1.0/24"] | 从 10.0.0.1 调用返回 `403 IP_NOT_ALLOWED` |
| 3 | 创建 Key 时设置 dailyTokenLimit = 100000，已用 95000 | 下一次调用预估 10000 tokens → 返回 `403 DAILY_LIMIT_EXCEEDED` |
| 4 | 创建 Key 时设置 refererRestrictions = ["myapp.com"] | Referer 为 evil.com 时返回 `403 REFERER_NOT_ALLOWED` |
| 5 | 创建 Key 时不设置任何权限限制 | 该 Key 可访问所有模型，无 IP/域名/额度限制 |
| 6 | 编辑 Key 权限修改 modelPermissions | 立即生效 → 调用变更日志可查 |
| 7 | dailyTokenLimit 次日 00:00 自动重置 | dailyTokensUsed 归零，调用恢复 |
| 8 | Key 级别 RPM=30，账户 RPM=60 | 该 Key 实际 RPM 限制为 30 |

---

## 20.5 登录异常检测前端展示

### 功能描述

后端已有 `geo-check`（地理位置检查）和 `login-security`（登录安全）服务，能在登录时自动检测异地登录和异常登录。但前端 `/console/security/login-history` 页面目前只展示原始登录记录（时间/IP/设备），未体现风险标记和用户交互（确认/否认异常）。本节在前端层面对登录记录进行增强展示，让用户可以直观看到每次登录的安全状态、确认异常登录是否本人操作，并在安全中心汇总异常登录趋势。

### 完成能力 / 展示效果

**用户端——增强版登录记录 `/console/security/login-history` `LoginHistoryEnhanced.tsx`：**

1. **登录记录列表增强**
   ```
   ┌──────────────────────────────────────────────────────────────────┐
   │  登录记录                                      筛选：[全部 ▼]     │
   ├──────────────────────────────────────────────────────────────────┤
   │                                                                  │
   │  🟢 2026-07-28 14:32  正常登录                                   │
   │     IP 183.14.xxx.xxx  ·  深圳 · 广东                            │
   │     Chrome 120 on Windows  ·  当前设备                          │
   │                                                                  │
   │  🟡 2026-07-28 09:15  异地登录 ⚠                               │
   │     IP 58.100.xxx.xxx  ·  北京  ·  （距离上次登录 1,950 km）      │
   │     Safari 17 on MacOS                                           │
   │     [确认是本人]  [这不是我 → 立即修改密码]                        │
   │                                                                  │
   │  🔴 2026-07-27 03:42  异常登录 ✗                                │
   │     IP 45.33.xxx.xxx  ·  美国纽约  ·  风控命中：TOR出口节点       │
   │     Firefox 115 on Linux                                         │
   │     系统已自动拦截此登录 ✋                                        │
   │     [确认是本人]  [这不是我 → 立即修改密码]                        │
   │                                                                  │
   │  🟢 2026-07-26 20:00  正常登录                                   │
   │     IP 183.14.xxx.xxx  ·  深圳 · 广东                            │
   │     Edge 119 on Windows                                          │
   │                                                                  │
   └──────────────────────────────────────────────────────────────────┘
   ```

   **每条登录记录展示：**
   - 风险标记色圆点：🟢 正常 / 🟡 可疑 / 🔴 异常被拦截
   - 登录时间（精确到秒）
   - 登录类型标签：`正常登录` / `异地登录 ⚠` / `异常登录 ✗` / `首次登录 🆕`
   - IP 地址（部分隐藏，如 183.14.xxx.xxx）+ 城市 + 省份/国家
   - 设备信息：浏览器 + 操作系统
   - 当前设备标识：`🏷 当前设备` 标签
   - 对于异地/异常登录，额外展示：
     - 风控命中规则名称
     - "确认是本人"按钮（蓝色）
     - "这不是我 → 立即修改密码"按钮（红色）
   - 已被用户确认为本人的记录，展示绿色 ✓ `已确认为本人` 标签

2. **"确认是本人"交互流程**
   - 用户点击"确认是本人" → `POST /api/v1/me/login-history/:id/confirm`
   - 后端更新 `confirmedByUser = true` + 降低该设备/该地区风险权重
   - 前端该条记录标签变为 `✓ 已确认为本人`
   - 同一设备/同一地区后续登录不再触发异常标记

3. **"这不是我"紧急响应流程**
   - 用户点击"这不是我" → 双重确认弹窗：
     ```
     ⚠️ 安全警告
     您确认这不是您本人的登录吗？
     
     如果不是您本人的操作，表明您的账户可能已被盗用。
     我们将立即：
     1. 登出所有设备（除当前设备外）
     2. 冻结该异常 IP 的所有访问
     3. 强制您修改密码
     
     [确认：这不是我]  [取消]
     ```
   - 确认后 → 后端执行：
     1. 登出所有非当前设备 session
     2. 将异常 IP 加入用户 IP 黑名单（user_ip_blacklist 表）
     3. 强制密码重置（要求用户修改密码）
     4. 记录安全事件
     5. 发送安全告警邮件

4. **登录异常详情弹窗 `LoginRiskAlert.tsx`**
   - 点击任一条异常登录记录 → 弹出详情弹窗：
   ```
   ┌─ 登录详情 ──────────────────────────────────┐
   │                                              │
   │  ⚠ 异地登录 — 2026-07-28 09:15:32          │
   │                                              │
   │  登录 IP：58.100.xxx.xxx                      │
   │  地理位置：北京 · 中国                         │
   │                                              │
   │  设备信息：                                   │
   │  Safari 17.4 on macOS 14.3                  │
   │  屏幕分辨率：2560×1664                        │
   │  设备指纹：a1b2c3d4...(截断)                   │
   │                                              │
   │  风控信息：                                   │
   │  命中规则：GEO_DISTANCE_ANOMALY               │
   │  上次登录位置：深圳 · 广东                     │
   │  距离：1,950 km                               │
   │  时间间隔：5 小时 17 分钟                       │
   │                                              │
   │  登录结果：✅ 已登录                            │
   │                                              │
   │  [确认是本人]  [立即修改密码]                   │
   └──────────────────────────────────────────────┘
   ```

**用户端——安全中心异常汇总 `SecurityRiskSummary.tsx`：**

位置：安全中心 `/console/security` 顶部汇总卡片

```
┌─────────────────────────────────────────────────────────────┐
│  🔒 安全概览                                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│  │   3      │  │   0      │  │  正常    │                 │
│  │ 近7天异常│  │ 近期拦截  │  │ 双因素   │                 │
│  │ 登录次数 │  │ 的登录   │  │ 认证     │                 │
│  └──────────┘  └──────────┘  └──────────┘                 │
│                                                             │
│  ████████████████░░░░ 异常登录趋势（近 7 天）                 │
│  Mon  Tue  Wed  Thu  Fri  Sat  Sun                        │
│   ██   ██   █    ████       █                              │
│                                                             │
│  🔔 最近风险事件：                                           │
│  · 7月28日 09:15 — 从北京异地登录（已确认本人）                │
│  · 7月27日 03:42 — 美国 TOR 节点登录被拦截                    │
│                                                             │
│  [查看详细登录记录 →]                                        │
└─────────────────────────────────────────────────────────────┘
```

### 数据表结构

```typescript
// login_history 表新增字段（在现有 login_history 表基础上扩展）
export const loginHistory = pgTable("login_history", {
  // ... 现有字段：id, userId, ip, city, country, deviceInfo, userAgent, loginAt, success
  riskLevel: varchar("risk_level", { length: 20 }).default("normal"),   // 'normal' | 'suspicious' | 'blocked'
  riskRule: varchar("risk_rule", { length: 100 }),                      // 命中的风控规则名称
  confirmedByUser: boolean("confirmed_by_user").default(false),         // 用户是否确认为本人
  confirmedAt: timestamp("confirmed_at"),
  previousLoginCity: varchar("previous_login_city", { length: 100 }),
  distanceKm: integer("distance_km"),                                   // 与上次登录的距离
  isBlocked: boolean("is_blocked").default(false),                      // 是否已被系统拦截
  blockReason: varchar("block_reason", { length: 200 }),
});

// 新增索引：riskLevel, userId + riskLevel
```

### API 接口

| 方法 | 路径 | 说明 | 参数 | 响应 |
|------|------|------|------|------|
| `GET` | `/api/v1/me/login-history` | 我的登录历史（增强版） | `?page&limit&riskLevel&includeRisk` | `{ records: LoginRecord[], total, summary: RiskSummary }` |
| `POST` | `/api/v1/me/login-history/:id/confirm` | 确认某次登录为本人 | — | `{ success: true }` |
| `POST` | `/api/v1/me/login-history/:id/report` | 报告异常登录（"这不是我"） | — | `{ success: true, actionTaken: string[] }` |
| `GET` | `/api/v1/me/security/summary` | 安全中心异常汇总 | — | `{ anomalyCount, blockedCount, trends, recentEvents }` |

### 前端组件 Props

**`LoginHistoryEnhanced.tsx`**

```typescript
interface LoginHistoryEnhancedProps {
  records: LoginRecord[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  onConfirm: (recordId: number) => Promise<void>;
  onReport: (recordId: number) => Promise<void>;
  filterType?: 'all' | 'suspicious' | 'blocked' | 'normal';
  onFilterChange: (type: string) => void;
}

interface LoginRecord {
  id: number;
  loginAt: string;
  ip: string;
  city: string;
  region: string;
  country: string;
  deviceName: string;
  os: string;
  browser: string;
  userAgent: string;
  success: boolean;
  riskLevel: 'normal' | 'suspicious' | 'blocked';
  riskRule: string | null;
  confirmedByUser: boolean;
  confirmedAt: string | null;
  previousLoginCity: string | null;
  distanceKm: number | null;
  isBlocked: boolean;
  blockReason: string | null;
  isCurrentDevice: boolean;
}
```

**`LoginRiskAlert.tsx`**

```typescript
interface LoginRiskAlertProps {
  open: boolean;
  record: LoginRecord | null;
  onClose: () => void;
  onConfirm: (recordId: number) => Promise<void>;
  onReport: (recordId: number) => Promise<void>;
}
```

**`SecurityRiskSummary.tsx`**

```typescript
interface SecurityRiskSummaryProps {
  summary: {
    anomalyCount: number;
    blockedCount: number;
    twoFactorEnabled: boolean;
    recentEvents: RiskEvent[];
    dailyCounts: Array<{ date: string; count: number }>;
  };
  loading: boolean;
}

interface RiskEvent {
  id: number;
  loginAt: string;
  city: string;
  riskRule: string;
  isBlocked: boolean;
  confirmedByUser: boolean;
}
```

### 上下游关系

```
上游：
  geo-check 服务 → 每次登录时计算地理位置距离 → 写入 login_history.riskLevel
  login-security 服务 → IP 风控检测 → 识别 TOR/代理/恶意 IP → 记录 riskRule
  login_history 表 → 登录记录基础数据
  users 表 → 用户信息

下游：
  用户确认/报告异常 → login_history 更新 confirmedByUser
  报告异常 → 安全响应引擎：
    ├─ 登出所有非当前设备
    ├─ 加入 user_ip_blacklist
    ├─ 强制密码重置
    └─ 发送安全事件邮件
  安全中心汇总 → 前端定时轮询 GET /security/summary
```

### 边界条件

| 场景 | 行为 |
|------|------|
| 首次登录 | riskLevel = "normal"，无 previousLoginCity，无距离信息 |
| 用户确认后同一地区再次登录 | 该地区加入该用户的"可信地区"列表 → 后续该地区登录 riskLevel = "normal" |
| 系统已拦截的登录 | isBlocked = true → 前端显示中断符号 ✋ + "系统已自动拦截此登录" |
| "这不是我"报告后的连锁操作 | 异步执行，前端展示"正在保护您的账户..." loading → 完成后显示操作清单 |
| 轮询频率 | 安全中心异常汇总每 60 秒轮询一次（登录记录按需加载，不轮询） |
| IP 隐私 | 登录记录中的 IP 前端展示时部分遮掩（末段隐藏：183.14.xxx.xxx） |
| 风险趋势图数据源 | 从 login_history 按天聚合 → COUNT WHERE riskLevel != 'normal' |
| 风控规则名称展示 | riskRule 直接展示友好名称，前端做中英文映射（如 `GEO_DISTANCE_ANOMALY` → "异地登录异常"） |

### 验收标准

| # | 验收场景 | 预期结果 |
|---|---------|---------|
| 1 | 用户从非常用地区登录 | 登录记录显示黄色 ⚠ + 风控规则 "异地登录异常" |
| 2 | 用户从 TOR 节点登录并被拦截 | 登录记录显示红色 ✗ + "系统已自动拦截此登录" |
| 3 | 用户点击"确认是本人" | 记录标记 confirmedByUser=true，该地区加入可信地区列表 |
| 4 | 用户点击"这不是我" | 弹窗确认 → 登出所有其他设备 → 强制修改密码 |
| 5 | 安全中心查看异常汇总 | 显示近 7 天异常登录次数、趋势图、最近风险事件 |
| 6 | 正常登录（常用地区） | 登录记录显示绿色 🟢 + "正常登录" |
| 7 | 用户从可信地区登录 | 不触发异常标记，正常绿色展示 |
| 8 | IP 被遮掩展示 | 登录记录中 IP 以 183.14.xxx.xxx 格式展示 |

---

## §20 总览与对接

### 与现有模块的对接关系

| 现有模块 | 本章新增/增强内容 | 对接方式 |
|---------|-----------------|---------|
| §2.4 API Key 管理 | Key 权限配置面板（20.4）| 在创建/编辑 Key 侧边栏中新增"权限"Tab |
| §2.2 仪表盘（第11区）| 预算状态卡片（20.1）| 替换或增强现有"成本预测卡片"区域 |
| §5 核心引擎 | 消费控制中间件（20.1）+ Key 权限拦截（20.4）| 在路由选择之后、供应商调用之前插入中间件 |
| §18.6 账号安全中心 | 设备管理页面（20.3）+ 2FA 设置页面（20.2）+ 异常登录展示（20.5）| 在安全中心新增子页面 |
| §2 登录记录 | 异常检测前端展示（20.5）| 重新渲染 login-history 页面，添加风险标记和交互按钮 |
| §14 错误码规范 | 新增错误码（见下方）| 在 §14 错误码参考页中追加 |

### 新增错误码

| 错误码 | HTTP 状态码 | 含义 | 来源模块 |
|--------|----------|------|---------|
| `QUOTA_EXCEEDED` | 403 | 月度消费预算已用尽，API 调用被熔断 | 20.1 |
| `DAILY_QUOTA_EXCEEDED` | 403 | 单日消费预算已用尽 | 20.1 |
| `DAILY_LIMIT_EXCEEDED` | 403 | 单 Key 每日 Token 额度已用尽 | 20.4 |
| `MODEL_NOT_ALLOWED` | 403 | 该 Key 没有权限访问指定模型 | 20.4 |
| `IP_NOT_ALLOWED` | 403 | 请求 IP 不在 Key 的 IP 白名单中 | 20.4 |
| `REFERER_NOT_ALLOWED` | 403 | 请求来源域名不在允许列表中 | 20.4 |
| `TWO_FACTOR_REQUIRED` | 401 | 需要进行双因素认证（登录流程中） | 20.2 |
| `TWO_FACTOR_LOCKED` | 429 | 2FA 验证失败次数过多，账户已锁定 | 20.2 |
| `TWO_FACTOR_INVALID` | 400 | 2FA 验证码无效 | 20.2 |
| `RECOVERY_CODE_INVALID` | 400 | 恢复码无效或已被使用 | 20.2 |
| `DEVICE_LOGGED_OUT` | 401 | 该设备已被登出（远程操作） | 20.3 |

### 新增定时任务

| 任务 | 执行时间 | 功能 |
|------|---------|------|
| 日预算重置 | 每日 00:00:00 | 重置 `currentDaySpent = 0` |
| 月预算重置 | 每月 1 日 00:00:00 | 重置 `currentMonthSpent = 0`, `blocked = false` |
| Key 日额度重置 | 每日 00:00:00 | 重置 `dailyTokensUsed = 0` |
| 设备过期清理 | 每日 03:00:00 | 标记超过 50 个上限的旧设备为 inactive |
| 信任设备过期 | 每日 03:00:00 | 清理 `trustedUntil < NOW()` 的信任设备记录 |
| 2FA 锁定清理 | 每小时 | 清除已过期锁定状态 |

### 优先级与依赖

| 模块 | 优先级 | 前置依赖 |
|------|--------|---------|
| 20.1 预算设置 | P0 | §2.2 仪表盘（展示位置）+ §5 路由引擎（中间件插入点） |
| 20.2 双因素认证 | P0 | auth 服务 + 通知服务 + §14 错误码 |
| 20.3 设备管理 | P1 | sessions 表 + 通知服务（WebSocket 推送登出） |
| 20.4 Key 权限控制 | P1 | §2.4 API Key 管理 + §5 路由引擎（中间件拦截点） |
| 20.5 登录异常展示 | P1 | geo-check 服务 + login-security 服务（后端已有，前端展示增强） |


---



---

## 2FA 认证与二次确认分层定义

### 分层规则

| 层级 | 操作类型 | 认证要求 | 说明 |
|------|---------|---------|------|
| L1 | 登录认证 | 2FA 仅 | 用户名+密码+OTP（TOTP 或短信） |
| L2 | 敏感读取操作 | 2FA 仅 | 查看 API Key 明文、查看财务详情 |
| L3 | 写操作 | 2FA + 二次确认 | 提现、修改安全设置、删除 Key、大额充值操作 |
| L4 | 高风险操作 | 2FA + 二次确认 + 冷却期 | 注销账号、变更手机号/邮箱 |

### 开关机制（AND 逻辑）

```
系统级开关（require_2fa）:
  [ON/OFF] -- site_configs 配置，决定系统是否开启 2FA 要求

用户级开关（user_2fa_enabled）：
  [ON/OFF] -- 用户在个人设置中开启自己的 2FA

启用条件：系统开关 ON AND 用户开关 ON（AND 逻辑）
效果：两个开关同时启用时才强制 2FA
```

### 二次确认（Double-Confirm）

写操作时，在 2FA 认证通过后，额外弹窗要求用户再次确认操作详情和风险提示。适用于：

- 提现操作：显示金额、收款账号、手续费 -> 用户确认
- API Key 删除：显示 Key 别名和影响范围 -> 用户确认
- 安全设置变更：显示变更前后对比 -> 用户确认

### 数据库变更

```typescript
// site_configs 新增
require2fa: boolean("require_2fa").default(false);  // 系统级 2FA 开关

// users 表新增
user2faEnabled: boolean("user_2fa_enabled").default(false);  // 用户级 2FA 开关

// security_logs 新增字段
confirmType: varchar("confirm_type", { length: 20 });  // '2fa_only' | '2fa_double'
confirmedAt: timestamp("confirmed_at", { withTimezone: true });
```


### [?] 页面帮助

**页面名称**：功能说明书：§20 用户端安全与预算增强

**适用角色**：视具体功能而定（参见总览中的优先级和适用角色说明）

**功能定位**：该页面提供 功能说明书：§20 用户端安全与预算增强 相关的配置、查询和管理能力。

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


---

### 预算检查与速率限制优先级

**执行顺序：预算检查 -> 速率限制**

1. **预算检查（budget_check）**：在请求处理管道中优先于费率限制执行。当用户余额/预算不足时，直接返回 `QUOTA_EXCEEDED` 错误码，不再继续执行费率限制检查。
2. **速率限制（rate_limiting）**：在预算检查之后执行。仅当预算/余额充足时才进行速率检查。超限时返回 `RATE_LIMITED` 错误码。

**熔断联动：** 当预算熔断激活（budget_meltdown 状态）后，跳过速率限制直接拒绝所有请求并返回 `QUOTA_EXCEEDED`。


| 错误码 | 含义 | 触发条件 |
|--------|------|---------|
| `QUOTA_EXCEEDED` | 预算/配额不足 | 用户余额或预算熔断激活 |
| `RATE_LIMITED` | 请求频率超限 | 速率限制器检测到超频 |
