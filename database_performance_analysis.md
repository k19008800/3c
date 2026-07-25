# 3cloud 数据库性能热点分析报告

## 分析范围
- 数据库 Schema：`api/src/db/schema/*.ts`
- 路由文件：`api/src/routes/*.ts` 和 `api/src/routes/admin/*.ts`
- 重点关注：`call_logs`、`audit_logs`、`balance_logs`、`operation_logs` 等大表

## 数据库性能瓶颈清单

| 优先级 | 表名 | 问题 | 影响 | 修复建议 |
|--------|------|------|------|----------|
| P0 | **call_logs** | 复合主键包含分区列，但某些查询可能跨分区扫描 | 查询性能随数据量增长而下降 | 确保查询始终包含分区键（created_at）的过滤条件 |
| P0 | **call_logs** | 管理员搜索使用子查询：`WHERE userId IN (SELECT id FROM users WHERE email ILIKE '%keyword%')` | 可能导致全表扫描，性能差 | 1. 为 `users.email` 添加 `gin_trgm_ops` 索引<br>2. 使用 JOIN 替代子查询 |
| P0 | **filter_logs**<br>**prompt_audit_logs**<br>**agent_client_call_logs** | 引用 `call_logs` 但无外键约束（分区表限制） | 数据完整性风险，关联查询效率低 | 1. 应用层校验数据一致性<br>2. 定期清理孤儿记录<br>3. 考虑使用引用 `call_logs` 副本表 |
| P1 | **audit_logs** | 未分区，数据量增长快 | 全表扫描风险 | 按 `created_at` 范围分区（季度/月度） |
| P1 | **balance_logs** | 未分区，高频交易场景 | 全表扫描风险 | 按 `created_at` 范围分区 |
| P1 | **operation_logs** | 未分区，用户操作频繁 | 全表扫描风险 | 按 `created_at` 范围分区 |
| P2 | **call_logs** | `modelName` 模糊搜索 (`LIKE '%keyword%'`) | 无法使用 B-tree 索引 | 1. 使用 `gin_trgm_ops` 索引支持前缀/后缀搜索<br>2. 或限制为前缀搜索 (`LIKE 'keyword%'`) |
| P2 | **users** | 邮箱搜索使用 `ILIKE` | 全表扫描 | 为 `email` 列添加 `gin_trgm_ops` 索引 |

## 详细分析

### 1. 索引缺失检测

#### ✅ 现有索引情况良好
- `call_logs` 表已为常见查询组合建立了索引：
  - `(userId, createdAt)` - 用户历史查询
  - `(status, createdAt)` - 状态过滤
  - `(modelName, createdAt.desc())` - 模型统计
  - `(vendorName, createdAt)` - 供应商统计
  - `(apiKeyId, createdAt)` - API密钥统计

#### ❌ 缺失的关键索引
1. **用户邮箱全文搜索索引**
   ```sql
   -- 当前查询模式（性能差）
   SELECT * FROM call_logs 
   WHERE userId IN (SELECT id FROM users WHERE email ILIKE '%keyword%');
   
   -- 建议索引
   CREATE INDEX users_email_trgm_idx ON users USING gin (email gin_trgm_ops);
   ```

2. **call_logs.modelName 模糊搜索索引**
   ```sql
   -- 当前查询
   WHERE modelName LIKE '%keyword%'
   
   -- 建议索引
   CREATE INDEX call_logs_model_name_trgm_idx ON call_logs USING gin (model_name gin_trgm_ops);
   ```

### 2. N+1 查询检测

#### ✅ 良好的优化实践
- `logs.ts` 中批量进行 GeoIP 富化，避免了 N+1
- `admin/logs.ts` 使用 LEFT JOIN 一次性获取关联数据
- 统计查询使用聚合函数，避免多次查询

#### ⚠️ 潜在风险
- 未发现明显的 N+1 查询模式
- 建议继续监控慢查询日志，特别是涉及用户信息关联的查询

### 3. 大表扫描风险

#### 🔴 高风险表分析

| 表名 | 数据特征 | 当前状态 | 建议 |
|------|----------|----------|------|
| **call_logs** | 高频写入，按月增长 GB 级 | ✅ 已按月分区 | 保持现有分区策略，监控分区大小 |
| **audit_logs** | 中频写入，审计操作记录 | ❌ 未分区 | 按季度分区，保留最近6-12个月数据 |
| **balance_logs** | 高频写入，财务交易流水 | ❌ 未分区 | 按月分区，长期归档策略 |
| **operation_logs** | 高频写入，用户操作日志 | ❌ 未分区 | 按月分区，设置TTL自动清理 |

#### 分区建议
```sql
-- audit_logs 分区示例
CREATE TABLE audit_logs_y2025m01 PARTITION OF audit_logs
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

### 4. 外键约束问题

#### 🔴 严重的数据完整性风险
由于 `call_logs` 是分区表，PostgreSQL 不支持从其他表引用分区表的外键约束。

**受影响的关系：**
1. `filter_logs.call_log_id` → `call_logs.id`
2. `prompt_audit_logs.call_log_id` → `call_logs.id`
3. `agent_client_call_logs.client_call_log_id` → `call_logs.id`

**缓解方案：**
1. **应用层校验**：在写入关联表前验证 `call_log_id` 存在
2. **定期清理**：定时任务清理无效的关联记录
3. **使用视图**：创建包含分区表的物化视图用于关联查询
4. **冗余设计**：在关联表中存储必要的 `call_logs` 信息副本

### 5. 查询性能优化建议

#### 立即执行（P0）
1. **添加用户邮箱搜索索引**
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   CREATE INDEX users_email_trgm_idx ON users USING gin (email gin_trgm_ops);
   ```

2. **优化管理员日志搜索查询**
   ```sql
   -- 优化前（使用子查询）
   WHERE userId IN (SELECT id FROM users WHERE email ILIKE '%keyword%')
   
   -- 优化后（使用JOIN）
   FROM call_logs cl
   JOIN users u ON cl.user_id = u.id AND u.email ILIKE '%keyword%'
   ```

3. **监控分区表查询计划**
   ```sql
   EXPLAIN (ANALYZE, BUFFERS) 
   SELECT * FROM call_logs 
   WHERE created_at >= '2025-01-01' 
     AND created_at < '2025-02-01'
     AND user_id = 123;
   ```

#### 短期优化（P1）
1. **为其他日志表添加分区**
   - `audit_logs`：按季度分区
   - `balance_logs`：按月分区  
   - `operation_logs`：按月分区

2. **添加模糊搜索索引**
   ```sql
   CREATE INDEX call_logs_model_name_trgm_idx ON call_logs USING gin (model_name gin_trgm_ops);
   ```

#### 长期规划（P2）
1. **数据生命周期管理**
   - 制定数据保留策略
   - 实现自动归档和清理
   - 冷热数据分离存储

2. **读写分离**
   - 统计查询路由到只读副本
   - 日志类写入使用主库

3. **监控告警**
   - 慢查询监控（>100ms）
   - 分区表大小监控
   - 索引使用率统计

## 性能测试建议

### 1. 负载测试场景
```sql
-- 高并发用户查询
SELECT * FROM call_logs 
WHERE user_id = ? AND created_at >= ? 
ORDER BY created_at DESC LIMIT 20;

-- 管理员综合搜索
SELECT * FROM call_logs cl
JOIN users u ON cl.user_id = u.id 
WHERE u.email ILIKE ? 
  AND cl.model_name ILIKE ?
  AND cl.created_at BETWEEN ? AND ?
ORDER BY cl.created_at DESC LIMIT 50;

-- 统计聚合查询
SELECT model_name, COUNT(*), SUM(total_tokens), AVG(duration_ms)
FROM call_logs 
WHERE created_at >= ?
GROUP BY model_name;
```

### 2. 监控指标
- 查询响应时间（p95, p99）
- 索引命中率
- 分区裁剪效率
- 锁等待时间

## 总结

**关键发现：**
1. ✅ `call_logs` 表已正确分区，索引设计良好
2. ❌ 其他日志表缺乏分区策略，存在全表扫描风险
3. ❌ 由于分区表限制，外键约束缺失导致数据完整性风险
4. ⚠️ 模糊搜索查询缺乏合适的索引支持

**优先级建议：**
1. **立即执行**：添加用户邮箱全文搜索索引，优化管理员搜索查询
2. **本周内完成**：为其他日志表设计分区策略
3. **本月内完成**：实现数据完整性校验机制，弥补外键约束缺失
4. **季度规划**：建立完整的监控体系和数据生命周期管理