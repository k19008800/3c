# T16 — DB Schema & 种子数据审计报告

> 生成时间: 2026-06-28 09:53 CST
> 文件: `api/src/db/schema.ts`, `api/src/db/seed.ts`

## 17 张表定义

| 序号 | 表名 | schema.ts | 路由引用 | 状态 |
|------|------|-----------|---------|------|
| 1 | users | ✅ | auth, admin/users, recharge, proxy | ✅ |
| 2 | api_keys | ✅ | api-keys, proxy, auth middleware | ✅ |
| 3 | team_members | ✅ | team | ✅ |
| 4 | user_role_history | ✅ | 暂无路由引用 | ⚠️ 未使用 |
| 5 | user_discounts | ✅ | 暂无路由引用 | ⚠️ 未使用 |
| 6 | vendors | ✅ | admin/vendors, admin/vendor-models, models | ✅ |
| 7 | models | ✅ | admin/models, admin/vendor-models, models, proxy | ✅ |
| 8 | vendor_models | ✅ | admin/vendor-models, models, proxy | ✅ |
| 9 | call_logs | ✅ | logs, admin/logs, admin/dashboard | ✅ |
| 10 | recharge_orders | ✅ | recharge, admin/recharge-admin, admin/users | ✅ |
| 11 | balance_logs | ✅ | recharge, admin/users, admin/dashboard | ✅ |
| 12 | agents | ✅ | agent, admin/agents | ✅ |
| 13 | agent_clients | ✅ | agent | ✅ |
| 14 | commission_logs | ✅ | agent | ✅ |
| 15 | withdraw_orders | ✅ | agent, admin/agents | ✅ |
| 16 | audit_logs | ✅ | admin/system, admin/users, admin/recharge | ✅ |
| 17 | system_configs | ✅ | admin/system | ✅ |
| 18 | email_templates | ✅ | 暂无路由引用 | ⚠️ 未使用 |
| 19 | page_contents | ✅ | 暂无路由引用 | ⚠️ 未使用 |

**注:** schema.ts 定义了 19 个表（含 1 email_templates + 1 page_contents），严格来说是 **19 张表** 而非任务描述的 17 张。

## 表字段一致性检查

### Decimal 约定
- 所有金额字段使用 `numeric(18,6)` ✅
- 示例: users.balance, rechargeOrders.amount, callLogs.cost, balanceLogs.amount

### 时间约定
- 所有时间字段使用 `timestamp with time zone` ✅
- UTC 存储 ✅

### 软删除
- users: `deletedAt: timestamp("deleted_at")` ✅
- api_keys: 无 deletedAt，使用物理删除 ✅ (设计决定)
- 其他表: 无 deletedAt（业务不需要恢复）✅

## Enums 完整性

| Enum | 定义 | 路由使用 |
|------|------|---------|
| user_type | personal, enterprise | ✅ |
| user_status | pending, active, disabled, deleted | ✅ |
| real_name_status | unverified, pending_review, approved, rejected | ✅ |
| user_role | super_admin, admin, agent, user | ✅ |
| team_role | team_owner, team_admin, team_member | ✅ |
| model_type | chat, embedding, image, audio | ✅ |
| vendor_status | active, down, degraded, disabled | ✅ |
| call_status | success, failed, timeout, cancelled | ✅ |
| order_status | pending, paid, cancelled, confirmed, refunded | ✅ |
| pay_channel | wechat_scan, wechat_jsapi, alipay_scan, alipay_jsapi, bank_transfer | ✅ |
| withdraw_status | pending_review, approved, rejected, paid | ✅ |
| commission_status | pending, settled | ✅ |
| balance_log_type | recharge, consumption, refund, trial_grant, admin_adjust, negative_repay | ✅ |
| audit_action | 19 种操作类型 | ✅ |

## 种子数据

seed.ts 定义了 23 条 system_configs（实际代码中的数组包含 24 个条目）：

| 分组 | 条目数 | 状态 |
|------|--------|------|
| 限流默认值 | 6 | ✅ |
| 告警阈值 | 2 | ✅ |
| 定价 | 1 | ✅ |
| 代理商 | 1 | ✅ |
| 免费体验 | 2 | ✅ |
| 折扣 | 2 | ✅ |
| 支付 | 4 | ✅ |
| 邮件 | 4 | ✅ |
| 管理员通知 | 1 | ✅ |
| 充值风控 | 4 | ✅ |
| **合计** | **27** | ⚠️ 代码中 27 条非 23 |

**问题:** schema.ts 注释标记 23 条种子数据，但 seed.ts 实际定义 27 条。V3.4 新增了 `admin_notify_email` 和 4 条充值风控配置。

## 索引覆盖

| 表 | 索引数 | 覆盖关键查询 | 状态 |
|----|--------|-------------|------|
| users | 4 | email唯一, status, teamId, realNameStatus | ✅ |
| api_keys | 3 | hash唯一, userId, status | ✅ |
| team_members | 2 | userId唯一, teamId+role | ✅ |
| vendors | 1 | name唯一 | ✅ |
| models | 2 | name唯一, type+status | ✅ |
| vendor_models | 3 | vendor+model唯一, modelId, vendor+down | ✅ |
| call_logs | 5 | 复合PK, userId+createdAt, apiKeyId+createdAt | ✅ |
| recharge_orders | 3 | orderNo唯一, userId, status | ✅ |
| balance_logs | 2 | userId+createdAt, type | ✅ |
| agents | 1 | userId唯一 | ✅ |
| agent_clients | 2 | agentId, client唯一 | ✅ |
| commission_logs | 3 | agentId, status, createdAt | ✅ |
| withdraw_orders | 2 | agentId, status | ✅ |
| audit_logs | 4 | operatorId, action, target, createdAt | ✅ |
| system_configs | 1 | key唯一 | ✅ |

## 汇总

| 检查项 | 结果 |
|--------|------|
| 表定义完整性 | ✅ 19 表 |
| 路由引用覆盖 | ✅ 14/19 表至少被一个路由引用 |
| 未使用表 | ⚠️ user_role_history, user_discounts, email_templates, page_contents |
| DECIMAL(18,6) 一致性 | ✅ |
| TIMESTAMP TZ 一致性 | ✅ |
| 种子数据文档同步 | ❌ schema.ts 注释 23 vs 实际 27 |
| 整体评分 | 85/100 |
