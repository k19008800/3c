# 3cloud 数据库索引优化报告

## 报告生成时间
2026/7/23 00:52:54

## 优化目标索引列表

### 1. call_logs 状态筛选索引
**表结构**: 分区表 (按月分区)
**索引**: (status, created_at DESC)
**查询场景**: 
- 后台调用记录管理页面
- 按状态筛选调用记录（成功/失败/进行中）
- 按时间倒序分页查看

**分区处理**: 
- 为每个月份分区创建独立索引
- 使用 CONCURRENTLY 避免锁表影响业务

### 2. balance_logs 用户流水索引
**表结构**: 普通表
**索引**: (user_id, created_at DESC)
**查询场景**: 
- 用户中心余额变动页面
- 查看用户最新余额变动记录
- 用户消费/充值流水查询

**优化点**: 
- 原有索引为 (user_id, created_at) 升序
- 新增 DESC 排序索引，更适合"最新记录在前"的场景

### 3. commission_logs 代理商佣金索引
**表结构**: 分区表 (按月分区)
**索引**: (agent_id, status, created_at DESC)
**查询场景**: 
- 代理商佣金管理页面
- 按代理商和状态筛选佣金记录
- 佣金结算查询

**分区处理**: 
- 为每个月份分区创建独立索引
- 包含 agent_id + status + created_at 组合查询

### 4. recharge_orders 用户充值索引
**表结构**: 普通表
**索引**: (user_id, status, created_at DESC)
**查询场景**: 
- 用户充值记录查询
- 按用户和状态筛选充值订单
- 充值管理后台

**优化点**: 
- 原有 user_id + created_at 索引
- 新增包含 status 字段的组合索引

### 5. withdraw_orders 提现审核索引
**表结构**: 普通表
**索引**: (agent_id, status, created_at DESC)
**查询场景**: 
- 代理商提现审核页面
- 按代理商和状态筛选提现申请
- 提现审核工作流

**现有索引分析**: 
- 已有 agent_id 单字段索引
- 已有 status 单字段索引
- 新增组合索引提升查询性能

### 6. audit_logs 操作审计索引
**表结构**: 普通表
**索引**: (operator_id, created_at DESC)
**查询场景**: 
- 操作审计日志查询
- 按操作员查看操作记录
- 安全审计追踪

**现有索引分析**: 
- 已有 operator_id 单字段索引
- 已有 created_at 单字段索引
- 新增组合索引避免索引合并

## 性能预期收益

### 查询性能提升
| 查询类型 | 优化前 | 优化后 | 提升幅度 |
|---------|--------|--------|---------|
| 状态筛选+分页 | 需要全表扫描或索引合并 | 直接使用覆盖索引 | 80-90% |
| 用户流水查询 | 需要排序操作 | 索引自带排序 | 60-70% |
| 多条件组合查询 | 多个索引合并 | 单一覆盖索引 | Jabber 50-60% |

### 资源使用优化
1. **CPU使用率**: 减少排序和索引合并操作，降低CPU消耗
2. **内存使用**: 减少临时文件写入，降低内存压力
3. **IO负载**: 减少全表扫描，降低磁盘IO

## 索引大小估算

| 索引名称 | 表大小估算 | 索引大小估算 |
|---------|------------|-------------|
| call_logs_*_status_created | ~50GB/月 | ~15GB/月 |
| balance_logs_user_created_desc | ~10GB | ~3GB |
| commission_logs_*_agent_status_created | ~20GB/月 | ~6GB/月 |
| recharge_orders_user_status_created | ~5GB | ~1.5GB |
| withdraw_orders_agent_status_created | ~3GB | ~900MB |
| audit_logs_operator_created | ~2GB | ~600MB |

## 监控建议

### 需要监控的指标
1. **查询响应时间**: 关注优化后查询的P95/P99响应时间
2. **索引使用率**: 监控新索引的使用频率
3. **索引大小增长**: 定期检查索引大小，避免过度膨胀

### 定期维护任务
1. **每月**: 为新月份分区创建对应索引
2. **每季度**: 清理过期分区的索引（如有需要）
3. **每半年**: 重新分析表统计信息，优化查询计划

## 风险控制

### 执行风险
1. **并发创建索引**: 使用 CONCURRENTLY 避免锁表
2. **空间占用**: 预留足够的磁盘空间
3. **性能影响**: 在业务低峰期执行

### 回滚方案
如需回滚，执行以下操作：
```sql
-- 删除新增的索引
DROP INDEX CONCURRENTLY IF EXISTS idx_balance_logs_user_created_desc;
DROP INDEX CONCURRENTLY IF EXISTS idx_recharge_orders_user_status_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_withdraw_orders_agent_status_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_audit_logs_operator_created;
```

## 后续优化建议

### 短期优化（1-2周）
1. 监控新索引的实际使用效果
2. 收集慢查询日志，分析优化效果
3. 调整查询语句，充分利用新索引

### 中期优化（1-3个月）
1. 考虑对高频查询表进行分区优化
2. 评估是否需要更多复合索引
3. 优化索引包含列，减少回表查询

### 长期优化（3-6个月）
1. 定期审查索引使用情况
2. 清理无效或低效索引
3. 考虑使用部分索引优化特定查询

---

## 执行结果验证

请运行以下查询验证索引创建情况：

```sql
-- 检查新增索引
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname LIKE 'idx_%'
AND indexname NOT LIKE '%_pkey'
ORDER BY tablename, indexname;

-- 检查分区表索引
SELECT 
    tablename,
    COUNT(*) as index_count
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename LIKE '%_2026%'
GROUP BY tablename
ORDER BY tablename;
```
