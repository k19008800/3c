# 数据库索引优化迁移说明

## 概述
本文档记录了 2026-07-24 对 3cloud 数据库进行的性能优化索引迁移。

## 迁移文件
- `api/migrations/2026-07-24-final-perf-indexes.sql`

## 执行目标

### 1. P0 优先级索引（已检查状态）
| 索引名称 | 状态 | 说明 |
|----------|------|------|
| `idx_call_logs_status_created` | **已存在** | 多个类似索引已存在 |
| `idx_balance_logs_user_created` | **已存在** | `balance_logs_user_created_at_idx` 和 `idx_balance_logs_user_created_desc` |
| `idx_commission_logs_agent_status` | **已存在** | `commission_logs_202607_agent_status_date_idx` |
| `idx_call_logs_analysis` | **需要创建** | 缺失的复合索引（model_name, ip, duration_ms） |

### 2. 外键约束（已检查状态）
| 外键约束 | 状态 | 说明 |
|----------|------|------|
| `fk_agents_user` | **已存在** | `agents_user_id_users_id_fk` |
| `fk_apikeys_user` | **已存在** | `api_keys_user_id_users_id_fk` |
| `fk_commission_agent` | **已存在** | 多个 `commission_logs_agent_id_fkey` 约束 |

### 3. 分区表索引同步
需要确保所有分区表都有相同的索引结构。

## 需要执行的变更

### 新增索引（P0缺失）
```sql
-- call_logs 分析索引（2026年分区表）
CREATE INDEX CONCURRENTLY idx_call_logs_202607_analysis ON call_logs_202607 (model_name, ip, duration_ms);
CREATE INDEX CONCURRENTLY idx_call_logs_202608_analysis ON call_logs_202608 (model_name, ip, duration_ms);
CREATE INDEX CONCURRENTLY idx_call_logs_202609_analysis ON call_logs_202609 (model_name, ip, duration_ms);
CREATE INDEX CONCURRENTLY idx_call_logs_202610_analysis ON call_logs_202610 (model_name, ip, duration_ms);
CREATE INDEX CONCURRENTLY idx_call_logs_202611_analysis ON call_logs_202611 (model_name, ip, duration_ms);
CREATE INDEX CONCURRENTLY idx_call_logs_202612_analysis ON call_logs_202612 (model_name, ip, duration_ms);
CREATE INDEX CONCURRENTLY idx_call_logs_202606_analysis ON call_logs_202606 (model_name, ip, duration_ms);
```

### 分区表索引同步检查
迁移文件中包含了分区表索引同步检查的脚本，会输出缺失的索引信息。

## 执行步骤

### 1. 备份数据库（生产环境）
```bash
# 执行全量备份
pg_dump -h localhost -U postgres -d threecloud -F c -f backup_2026-07-24.dump

# 或使用 pg_dumpall 备份所有数据库
pg_dumpall -h localhost -U postgres > backup_all_2026-07-24.sql
```

### 2. 执行迁移（开发/测试环境）
```bash
# 进入 API 目录
cd 3cloud/api

# 使用 psql 执行迁移
psql -h localhost -U postgres -d threecloud -f migrations/2026-07-24-final-perf-indexes.sql

# 或使用 Node.js 脚本执行
npm run db:migrate:run -- --file 2026-07-24-final-perf-indexes
```

### 3. 验证索引创建
```sql
-- 验证分析索引创建
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename LIKE 'call_logs_%' 
    AND indexname LIKE '%analysis%'
ORDER BY tablename, indexname;

-- 检查外键约束
SELECT 
    tc.table_name,
    tc.constraint_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.table_name IN ('agents', 'api_keys', 'commission_logs')
    AND tc.constraint_type = 'FOREIGN KEY';
```

### 4. 性能测试（可选）
```sql
-- 测试分析查询性能
EXPLAIN ANALYZE
SELECT 
    model_name,
    ip,
    COUNT(*) as call_count,
    AVG(duration_ms) as avg_duration,
    SUM(duration_ms) as total_duration
FROM call_logs_202607
WHERE model_name IS NOT NULL 
    AND ip IS NOT NULL 
    AND duration_ms > 0
GROUP BY model_name, ip
ORDER BY call_count DESC
LIMIT inity: 10;
```

## 风险和注意事项

### 1. CONCURRENTLY 索引创建
- 使用 `CREATE INDEX CONCURRENTLY` 避免锁表
- 如果创建失败，可能需要手动清理
- 创建期间对性能有轻微影响

### 2. 分区表注意事项
- 需要为每个分区表单独创建索引
- 未来月份的分区表需要自动创建索引
- 考虑在分区表创建时自动添加标准索引集

### 3. 索引大小
- 复合索引会增加存储空间
- 预计每个分区表的分析索引大小：约 50-200MB（取决于数据量）

### 4. 回滚方案
如果出现问题，可以删除新创建的索引：
```sql
-- 删除分析索引
DROP INDEX CONCURRENTLY IF EXISTS idx_call_logs_202607_analysis;
DROP INDEX CONCURRENTLY IF EXISTS idx_call_logs_202608_analysis;
DROP INDEX CONCURRENTLY IF EXISTS idx_call_logs_202609_analysis;
DROP INDEX CONCURRENTLY IF EXISTS idx_call_logs_202610_analysis;
DROP INDEX CONCURRENTLY IF EXISTS idx_call_logs_202611_analysis;
DROP INDEX CONCURRENTLY IF EXISTS idx_call_logs_202612_analysis;
DROP INDEX CONCURRENTLY IF EXISTS idx_call_logs_202606_analysis;
```

## 监控和优化建议

### 1. 监控索引使用情况
```sql
-- 查看索引使用统计
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    idx_tup_read as rows_read,
    idx_tup_fetch as rows_fetched
FROM pg_stat_user_indexes
WHERE tablename LIKE 'call_logs_%'
ORDER BY idx_scan DESC;
```

### 2. 定期维护
- 每月检查新分区表的索引
- 季度性清理未使用的索引
- 监控索引膨胀情况

### 3. 自动化建议
建议将分区表索引同步自动化：
- 在分区表创建时自动添加标准索引
- 每月自动为新月份分区表创建索引
- 监控索引创建失败并告警

## 总结
本次迁移主要解决了：
1. **P0缺失索引**：添加了 call_logs 分析复合索引
2. **外键验证**：确认了现有外键约束的有效性
3. **分区表一致性**：提供了索引同步检查机制

执行迁移后，数据库的统计分析查询性能将得到显著提升。