# 分区清理功能部署指南

## 概述
本文档指导如何部署和验证分区表自动清理功能。

## 文件清单
| 文件 | 用途 | 状态 |
|------|------|------|
| `migrations/2026-07-23-partition-cleanup.sql` | SQL 清理函数 | ✅ 已创建 |
| `src/cron/partition-cleanup.ts` | Cron 定时任务 | ✅ 已创建 |
| `src/app/index.ts` | Cron 调度注册 | ✅ 已修改 |
| `PERF-ANALYSIS/fix-partition-cleanup.md` | 修复报告 | ✅ 已创建 |
| `test-partition-cleanup.ts` | 测试脚本 | ✅ 已创建 |

## 部署步骤

### 步骤 1: 应用数据库迁移
```bash
# 连接到 PostgreSQL 数据库
psql -d 3cloud -U postgres -h localhost

# 执行迁移文件
\i migrations/2026-07-23-partition-cleanup.sql

# 验证函数创建
\df cleanup_old_partitions
```

### 步骤 2: 编译和重启服务
```bash
# 开发环境（热重载）
npm run dev

# 或生产环境构建
npm run build
npm run start:prod
```

### 步骤 3: 验证函数逻辑
```bash
# 运行测试脚本（不实际删除数据）
npx tsx test-partition-cleanup.ts

# 预期输出示例：
# 🧪 测试分区清理函数
# 1. 检查 cleanup_old_partitions 函数是否存在...
# ✅ 函数存在
# 2. 查看现有分区表...
# 找到 14 个分区表:
# - call_logs_202401
# - call_logs_202402
# ...
# 3. 测试清理函数逻辑...
# 根据保留策略，2 个分区将被清理:
# - call_logs_202401 (超过保留期)
# - commission_logs_202312 (超过保留期)
```

### 步骤 4: 手动执行测试
```bash
# 手动执行清理函数（谨慎操作）
psql -d 3cloud -c "SELECT cleanup_old_partitions();"

# 或通过 TypeScript 执行
npx tsx -e "
import { runPartitionCleanupNow } from './src/cron/partition-cleanup.js';
runPartitionCleanupNow();
"
```

### 步骤 5: 验证 Cron 调度
```bash
# 检查服务日志，确认定时任务已注册
# 预期日志输出：
# [Cron] Partition cleanup scheduled: daily at 03:30
```

## 验证要点

### 1. 函数安全性验证
```sql
-- 验证不会删除活跃分区
SELECT 
  tablename,
  tablename < 'call_logs_' || to_char(CURRENT_DATE - INTERVAL '6 months', 'YYYYMM') as should_drop_call,
  tablename < 'commission_logs_' || to_char(CURRENT_DATE - INTERVAL '12 months', 'YYYYMM') as should_drop_commission
FROM pg_tables 
WHERE schemaname = 'public' 
AND (tablename LIKE 'call_logs_%' OR tablename LIKE 'commission_logs_%');
```

### 2. 保留策略验证
- `call_logs_*`: 保留最近 6 个月
- `commission_logs_*`: 保留最近 12 个月
- 当前月份和未来月份的分区不会被删除

### 3. 错误处理验证
```sql
-- 测试异常处理
BEGIN;
-- 故意创建一个错误的分区名
CREATE TABLE test_invalid_partition (id SERIAL);
-- 执行清理函数应该继续处理其他分区
SELECT cleanup_old_partitions();
ROLLBACK;
```

## 监控配置

### 日志监控
```bash
# 查看分区清理日志
grep -i "PartitionCleanup\|cleanup_old_partitions" /path/to/logs/*.log

# 预期成功日志
[PartitionCleanup] Old partitions cleaned successfully
[PartitionCleanup] Dropped call_logs partition: call_logs_202401

# 预期错误日志（如果发生）
[PartitionCleanup] Failed to clean partitions: [错误详情]
```

### 磁盘空间监控
```bash
# 清理前后对比
du -sh /var/lib/postgresql/data/base/[oid]/
# 或
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public' 
AND (tablename LIKE 'call_logs_%' OR tablename LIKE 'commission_logs_%')
ORDER BY tablename;
```

## 回滚方案

### 情况 1: 需要禁用清理功能
```typescript
// 临时注释掉 src/app/index.ts 中的调度代码
// cron.schedule("30 3 * * *", async () => { ... });
```

### 情况 2: 需要修改保留策略
```sql
-- 更新清理函数
CREATE OR REPLACE FUNCTION cleanup_old_partitions()
RETURNS void AS $$
DECLARE
    partition_name text;
    cutoff_date date := current_date - interval '3 months'; -- 改为3个月
    cutoff_commission date := current_date - interval '6 months'; -- 改为6个月
BEGIN
    -- ... 函数体不变
END;
$$ LANGUAGE plpgsql;
```

### 情况 3: 需要删除清理函数
```sql
DROP FUNCTION IF EXISTS cleanup_old_partitions();
```

## 生产环境检查清单

### 部署前检查
- [ ] 数据库已备份
- [ ] 在测试环境验证通过
- [ ] 保留策略已确认（6个月/12个月）
- [ ] 清理时间已确认（03:30 AM）

### 部署后验证
- [ ] 函数成功创建
- [ ] Cron 任务成功注册
- [ ] 手动执行测试成功
- [ ] 监控日志正常
- [ ] 磁盘空间变化符合预期

### 首次执行监控
- [ ] 确认执行时间（凌晨 3:30）
- [ ] 确认清理的分区符合预期
- [ ] 确认没有误删活跃分区
- [ ] 确认错误处理正常

## 常见问题

### Q1: 清理函数没有执行？
**检查**:
1. Cron 表达式是否正确: `"30 3 * * *"`
2. 时区设置是否正确（Asia/Shanghai）
3. 服务日志是否有注册成功消息
4. PostgreSQL 日志是否有函数执行记录

### Q2: 分区没有被清理？
**检查**:
1. 分区命名是否符合模式: `call_logs_YYYYMM`
2. 分区日期是否超过保留期
3. 函数是否有权限执行 DROP TABLE
4. 是否有外键约束阻止删除

### Q3: 清理导致性能问题？
**建议**:
1. 确认在凌晨低峰期执行
2. 监控 DROP TABLE 操作的持续时间
3. 考虑分批清理（如果有大量旧分区）

### Q4: 需要调整保留策略？
**操作**:
1. 更新 SQL 函数中的保留期变量
2. 重新部署函数
3. 验证新策略下的清理结果

## 联系支持
如遇问题，请联系:
- 数据库管理员
- 系统运维团队
- 开发团队负责人

---

**文档版本**: v1.0  
**最后更新**: 2026-07-23  
**维护团队**: 数据库优化小组