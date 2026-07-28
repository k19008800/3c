# 08 — 时长配额管控

> **后端**: 1.5 人天 | **前端**: 0.5 人天 | **依赖**: 无

---

## 1. 背景与目标

**问题**：当前只有 RPM/TPM 瞬时限流，缺少"月度/日度额度"管控。无法实现"免费用户每月 100 万 Token"、"企业用户每日 5000 次调用"等周期性配额。

**目标**：新增周期性配额体系，支持按日/周/月/季/年设置配额上限，到期自动重置，超额拒绝或降级。

---

## 2. 数据库设计

### 新建 `recurring_quotas` 表

```typescript
export const recurringQuotas = pgTable("recurring_quotas", {
  id: serial("id").primaryKey(),
  
  // 作用目标
  targetType: varchar("target_type", { length: 20 }).notNull(),
  // 'user' | 'api_key' | 'agent' | 'global'
  targetId: integer("target_id").notNull(),
  
  // 配额定义
  quotaType: varchar("quota_type", { length: 20 }).notNull().default("tokens"),
  // 'tokens' | 'calls' | 'cost' | 'cost_cny'
  periodType: varchar("period_type", { length: 20 }).notNull(),
  // 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  
  // 配额限制
  quotaAmount: numeric("quota_amount", { precision: 18, scale: 2 }).notNull(),
  
  // 当前周期用量（由定时任务或实时更新维护）
  usedAmount: numeric("used_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  
  // 周期起止（自动计算）
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  
  // 超量后的策略
  overLimitAction: varchar("over_limit_action", { length: 20 }).notNull().default("reject"),
  // 'reject' | 'warn' | 'degrade' | 'continue'
  
  // 设置
  alertPercent: numeric("alert_percent", { precision: 5, scale: 2 }).default("80.00"),
  // 用量达到此百分比时发送告警
  
  status: boolean("status").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

// 索引
// (targetType, targetId, periodType, periodEnd) 复合唯一索引
```

### `quota_logs` 表（用量记录）

```typescript
export const quotaLogs = pgTable("quota_logs", {
  id: serial("id").primaryKey(),
  quotaId: integer("quota_id").notNull().references(() => recurringQuotas.id),
  changeAmount: numeric("change_amount", { precision: 18, scale: 6 }).notNull(),
  newUsedAmount: numeric("new_used_amount", { precision: 18, scale: 2 }).notNull(),
  logType: varchar("log_type", { length: 20 }).notNull(),
  // 'usage' | 'reset' | 'adjust' | 'alert'
  
  // 关联调用记录（usage 类型时）
  callLogId: integer("call_log_id"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
})
```

---

## 3. API 设计

### 管理端

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/v1/admin/quotas` | GET | 配额规则列表（可分页/按目标筛选）|
| `/api/v1/admin/quotas` | POST | 创建配额规则 |
| `/api/v1/admin/quotas/:id` | PATCH | 修改配额（金额、策略） |
| `/api/v1/admin/quotas/:id` | DELETE | 删除配额规则 |
| `/api/v1/admin/quotas/:id/reset` | POST | 手动重置周期用量 |
| `/api/v1/admin/quotas/:id/logs` | GET | 配额使用日志 |

```typescript
// POST /api/v1/admin/quotas
{
  "targetType": "user",
  "targetId": 123,
  "quotaType": "tokens",
  "periodType": "monthly",
  "quotaAmount": "1000000",
  "overLimitAction": "reject",
  "alertPercent": 80
}
```

### 用户端

| 端点 | 方法 | 用途 |
|------|------|------|
| `GET /api/v1/user/quota` | GET | 当前用户的配额列表+用量进度 |
| `GET /api/v1/user/api-keys/:id/quota` | GET | 指定 Key 的配额详情 |

```typescript
// GET /api/v1/user/quota
{
  "quotas": [
    {
      "id": 1,
      "quotaType": "tokens",
      "periodType": "monthly",
      "quotaAmount": "1000000",
      "usedAmount": "234567",
      "usagePercent": 23.46,
      "periodStart": "2026-07-01T00:00:00Z",
      "periodEnd": "2026-07-31T23:59:59Z",
      "overLimitAction": "reject",
      "remaining": "765433"
    },
    {
      "quotaType": "calls",
      "periodType": "daily",
      "quotaAmount": "5000",
      "usedAmount": "234",
      // ...
    }
  ]
}
```

---

## 4. 核心逻辑

### 路由流程增加配额检查

在 `proxy.ts` 的限流检查后、路由选择前插入：

```typescript
// proxy.ts — handleNonStreaming / handleStreaming
await checkRateLimit()      // 现有
await checkRecurringQuota(userId, modelId, apiKeyId)  // 新增
```

```typescript
// api/src/services/quota-service.ts 扩展

async function checkRecurringQuota(
  userId: number,
  modelId: number,
  apiKeyId: number | null,
): Promise<void> {
  // 获取所有影响此请求的配额
  // 优先级：api_key 级 > user 级 > global 级
  const quotas = await getApplicableQuotas(userId, apiKeyId)
  
  for (const quota of quotas) {
    // 检查是否在本周期内
    if (!isWithinPeriod(quota)) {
      await resetQuotaPeriod(quota)
    }
    
    if (Number(quota.usedAmount) >= Number(quota.quotaAmount)) {
      switch (quota.overLimitAction) {
        case 'reject':
          throw new AppError('QUOTA_EXCEEDED',
            `${quota.quotaType} 配额已用尽（${quota.quotaAmount}），` +
            `重置时间：${quota.periodEnd.toISOString().slice(0, 10)}`, 402)
        case 'warn':
          // 仅记录告警，不阻断
          await recordQuotaAlert(quota)
          break
        case 'degrade':
          // 降级到慢速/低成本模型
          request.priority = 'low_cost'
          break
        case 'continue':
          // 超额继续（会计入账单）
          break
      }
    } else if (Number(quota.usedAmount) / Number(quota.quotaAmount) >= Number(quota.alertPercent) / 100) {
      // 超过告警阈值 → 发送通知（每小时限 1 次）
      await sendQuotaAlertIfNeeded(quota)
    }
  }
}
```

### 计费后更新用量

在 `billing.ts` 的 `charge()` 函数内追加：

```typescript
// charge() 成功后
await Promise.all([
  updateRecurringQuotaUsage(userId, 'tokens', totalTokens, callLogId),
  updateRecurringQuotaUsage(userId, 'calls', 1, callLogId),
  updateRecurringQuotaUsage(userId, 'cost', cost, callLogId),
])
```

```typescript
async function updateRecurringQuotaUsage(
  userId: number,
  quotaType: string,
  amount: number,
  callLogId: number | null,
): Promise<void> {
  const activeQuotas = await getActiveQuotasByType(userId, quotaType)
  
  for (const quota of activeQuotas) {
    // 确保周期正确
    if (!isWithinPeriod(quota)) {
      await resetQuotaPeriod(quota)
    }
    
    // 原子更新用 Redis Lua 脚本
    const redis = getRedis()
    await redis.eval(`
      local key = KEYS[1]
      local amount = tonumber(ARGV[1])
      local newVal = redis.call("INCRBYFLOAT", key, amount)
      -- 更新 DB（异步，最终一致）
      return newVal
    `, 1, `quota:${quota.id}:used`, amount.toString())
  }
}
```

### 定时任务：周期重置

```typescript
// api/src/cron/quota-reset.ts
// cron 表达式：每分钟执行一次

async function checkPeriodRollover() {
  // 查询所有 periodEnd < now() 且 status=true 的配额
  const expiredQuotas = await db.select()
    .from(recurringQuotas)
    .where(and(
      lte(recurringQuotas.periodEnd, new Date()),
      eq(recurringQuotas.status, true),
    ))
  
  for (const quota of expiredQuotas) {
    const nextPeriod = calculateNextPeriod(quota.periodType, quota.periodEnd)
    
    await db.transaction(async (tx) => {
      // 记录旧周期日志
      await tx.insert(quotaLogs).values({
        quotaId: quota.id,
        changeAmount: `-${quota.usedAmount}`,
        newUsedAmount: '0',
        logType: 'reset',
      })
      
      // 重置
      await tx.update(recurringQuotas)
        .set({
          usedAmount: '0',
          periodStart: nextPeriod.start,
          periodEnd: nextPeriod.end,
          updatedAt: new Date(),
        })
        .where(eq(recurringQuotas.id, quota.id))
    })
  }
}
```

---

## 5. 前端展示

### 用户端仪表盘配额进度条

```
💰 月度配额
Token ━━━━━━━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━ 23.5%
       ████████████████░░░░░░░░░░░░░░░░░░░░
       234,567 / 1,000,000    剩余: 765,433
       本月重置: 07-31

调用 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 4.7%
       ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
       234 / 5,000            剩余: 4,766
       每日重置: 明日 00:00
```

### 管理端配额配置页

```
配额管理
┌────────────────────────────────────────────────────────────┐
│ [+ 创建配额规则]                                            │
│                                                             │
│ ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐ │
│ │ 目标  │ 类型  │ 周期  │ 额度  │ 已用  │ 进度  │ 策略  │ 操作 │ │
│ ├──────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┤ │
│ │ 免费  │Token │ 月度 │ 100万│23.5万│ 23%  │ 拒绝 │ 编辑 │ │
│ │ 用户  │      │      │      │      │      │      │ 删除 │ │
│ ├──────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┤ │
│ │ 企业  │调用  │ 每日 │ 5000 │ 234  │ 4.7% │ 续用 │ 编辑 │ │
│ │ 用户  │      │      │      │      │      │      │ 删除 │ │
│ └──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘ │
└────────────────────────────────────────────────────────────┘
```

---

## 6. 验收标准

- [ ] 支持按用户/API Key 创建周期性配额（日/周/月/季/年）
- [ ] 超量策略：拒绝/警告/降级/续用（四种全部实现）
- [ ] 计费后实时更新配额用量
- [ ] 周期到期自动重置
- [ ] 用量达到告警阈值（如 80%）自动发送通知
- [ ] 用户端仪表盘展示配额进度条
- [ ] 管理端配额规则 CRUD
- [ ] 配额日志可追溯历史变更
