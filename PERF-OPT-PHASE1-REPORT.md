# 3cloud 性能优化执行报告（Phase 1）

> 执行日期：2026-07-21
> 执行范围：后端 P0 瓶颈修复 + 数据库索引 + TTL 清理
> 状态：**后端 P0 全部完成**

---

## 一、已完成的优化项

### 1. API 后端 N+1 查询修复（5 项）

| # | 文件 | 问题 | 修复方案 | 预估收益 |
|---|------|------|----------|----------|
| ✅ | `agent-redemption.ts` | 三重 N+1 循环（200代理→601次DB） | 批量 GROUP BY 聚合 + 内存计算 | 延迟降低 95%（~700ms→~50ms） |
| ✅ | `agent-redemption.ts` | 兑换码追溯 map 内逐条查余额 | 批量查询 balance_logs | 延迟降低 90%+ |
| ✅ | `finance.ts` | 批量审核逐条查询订单 | 先批量查询 + 内存验证 + 合并事务 | 100条审核：5s→0.5s |
| ✅ | `vendors.ts` | 模型同步逐条 Upsert（80模型→240次DB） | 批量查询 + 内存处理 + 批量写入 | 3s→0.3s |
| ✅ | `price-service.ts` | 定价倍率循环内逐条 update | CASE WHEN 批量 UPDATE | N次→1次 |

### 2. Redis KEYS 阻塞命令替换（6 处）

| # | 文件 | 原代码 | 修复 |
|---|------|--------|------|
| ✅ | `daily-summary.ts` | `redis.keys("risk:ban:ip:*")` | SCAN 循环 |
| ✅ | `security/bans.ts` | `redis.keys("risk:ban:ip:*")` | SCAN 循环 |
| ✅ | `security/index.ts` | `redis.keys("risk:ban:ip:*")` | SCAN 计数 |
| ✅ | `permission-engine.ts` | `redis.keys("perm:user:*")` | SCAN 循环 |
| ✅ | `security-event.ts` | `redis.keys("risk:ban:ip:*")` | SCAN 计数 |
| ✅ | `circuit-breaker/queries.ts` | `redis.keys("cb:v2:open:*")` | SCAN 计数 |

**收益**：消除 Redis 阻塞风险，百万级 key 场景下避免数十秒阻塞。

### 3. 数据库索引迁移（9 个索引）

迁移文件：`src/db/migrations/2026-07-21-perf-indexes.sql`

| # | 索引名 | 表 | 字段 | 用途 |
|---|--------|-----|------|------|
| 1 | `kg_items_route_idx` | vendor_key_group_items | (status, is_down) WHERE status=true | 路由决策 |
| 2 | `balance_logs_ref_idx` | balance_logs | (ref_type, ref_id) | 退款追踪 |
| 3 | `comm_logs_client_call_idx` | commission_logs | (client_call_log_id) | 按 call 找佣金 |
| 4 | `call_logs_key_item_idx` | call_logs | (key_group_item_id, price_source) | Key 定价溯源 |
| 5 | `filter_logs_call_idx` | filter_logs | (call_log_id) | 反向排查 |
| 6 | `filter_logs_user_idx` | filter_logs | (user_id) | 反向排查 |
| 7 | `filter_logs_key_idx` | filter_logs | (api_key_id) | 反向排查 |
| 8 | `abl_ref_idx` | agent_balance_ledger | (ref_type, ref_id) | 审计追踪 |
| 9 | `user_login_history_ip_idx` | user_login_history | (ip, created_at DESC) | IP 频率分析 |

### 4. 日志表 TTL 清理策略

迁移文件：`src/db/migrations/2026-07-21-log-ttl-cleanup.sql`

| 表 | 保留期限 | 清理函数 |
|-----|----------|----------|
| operation_logs | 90 天 | `cleanup_operation_logs()` |
| filter_logs | 30 天 | `cleanup_filter_logs()` |
| security_events | 90 天 | `cleanup_security_events()` |
| audit_logs | 180 天 | `cleanup_audit_logs()` |
| user_login_history | 12 个月 | `cleanup_login_history()` |
| call_logs | 6 个月（分区） | 手动 DETACH + 归档 |
| commission_logs | 12 个月（分区） | 手动 DETACH + 归档 |

**统一入口**：`SELECT run_log_cleanup();`

---

## 二、待执行的优化项（前端 P0）

前端优化工作量较大，建议分批执行：

| # | 任务 | 预估工时 | 说明 |
|---|------|----------|------|
| 1 | 拆分 VendorKeyGroups.tsx (1121行) | 3h | 拆为 GroupListPanel + KeyTablePanel + BatchActionBar |
| 2 | 拆分 Redemption.tsx (1019行) | 3h | 拆为 BatchList + CodeTable + StatsPanel |
| 3 | 拆分 FinanceCommissions.tsx (1012行) | 2h | 拆为 CommissionTable + SettlementPanel |
| 4 | 添加 React.memo 到叶子组件 | 4h | 表格行/卡片/弹窗包裹 memo |
| 5 | 拆分 AuthContext | 2h | 拆为 AuthUserContext + AuthActionsContext |
| 6 | 添加 AbortController | 3h | useEffect cleanup + 请求取消 |

---

## 三、性能对比测试方案

### 测试场景

| 场景 | API/页面 | 基准指标 | 目标指标 | 验证方法 |
|------|----------|----------|----------|----------|
| 代理概览页 | GET /admin/redemption/agent-overview | ~2000ms (200代理) | <200ms | autocannon 压测 |
| 批量审核 | POST /admin/recharge-orders/batch-confirm | ~5000ms (100条) | <500ms | 集成测试 |
| 供应商模型同步 | POST /admin/vendors/:id/sync-models | ~3000ms (80模型) | <300ms | 手动测试 |
| Redis 封禁查询 | GET /admin/security/bans | 阻塞风险 | 无阻塞 | Redis MONITOR |

### 测试命令

```bash
# 1. 执行数据库迁移
psql -U postgres -d threecloud -f src/db/migrations/2026-07-21-perf-indexes.sql
psql -U postgres -d threecloud -f src/db/migrations/2026-07-21-log-ttl-cleanup.sql

# 2. 重启 API 服务
cd 3cloud/api && npm run dev

# 3. 压测代理概览接口
autocannon -c 10 -d 10 http://localhost:3000/api/v1/admin/redemption/agent-overview

# 4. 验证 Redis 无 KEYS 命令
redis-cli MONITOR | grep "keys"
```

---

## 四、交付物清单

| 文件 | 说明 |
|------|------|
| `api/src/routes/admin/agent-redemption.ts` | N+1 修复（2处） |
| `api/src/routes/admin/finance.ts` | 批量审核 N+1 修复 |
| `api/src/routes/admin/vendors.ts` | 模型同步 N+1 修复 |
| `api/src/services/price-service.ts` | 批量 UPDATE 修复 |
| `api/src/services/daily-summary.ts` | KEYS→SCAN |
| `api/src/routes/admin/security/bans.ts` | KEYS→SCAN |
| `api/src/routes/admin/security/index.ts` | KEYS→SCAN |
| `api/src/services/permission-engine.ts` | KEYS→SCAN |
| `api/src/services/security-event.ts` | KEYS→SCAN |
| `api/src/services/circuit-breaker/queries.ts` | KEYS→SCAN |
| `api/src/db/migrations/2026-07-21-perf-indexes.sql` | 索引迁移 |
| `api/src/db/migrations/2026-07-21-log-ttl-cleanup.sql` | TTL 清理 |
| `PERF-OPT-MASTER-REPORT.md` | 总报告 |
| `PERF-OPT-PHASE1-REPORT.md` | 本报告 |

---

## 五、下一步建议

1. **立即执行**：运行数据库迁移脚本添加索引
2. **配置 Cron**：每周执行 `run_log_cleanup()` 清理日志
3. **验证效果**：运行压测对比优化前后性能
4. **前端优化**：分批执行组件拆分和 memo 优化（建议安排 2-3 天）

---

*Phase 1 后端优化执行完毕，等待验证和前端优化执行。*
