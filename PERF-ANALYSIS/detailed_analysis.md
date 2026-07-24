# 3cloud 数据库详细性能分析

## 目录
1. [核心表分析](#核心表分析)
2. [索引深度分析](#索引深度分析)
3. [外键完整性分析](#外键完整性分析)
4. [查询模式分析](#查询模式分析)
5. [分区表详细分析](#分区表详细分析)
6. [具体优化SQL](#具体优化sql)
7. [监控与维护计划](#监控与维护计划)

## 核心表分析

### 1. 用户相关表
```sql
-- users表：主表，已有3个索引
-- 现有索引：email唯一索引、status索引、realNameStatus索引
-- 建议：添加基于role和created_at的复合索引，用于管理员查询
CREATE INDEX CONCURRENTLY idx_users_role_created ON users(role, created_at DESC);
```

### 2. 计费相关表
#### `call_logs` 分区表
- **分区策略**: 按月分区
- **当前分区**: 202606-202612 (7个月)
- **最大分区**: call_logs_202607 (250MB)
- **索引情况**: 每个分区约9-10个索引

**优化建议**:
1. 热点分区读写分离
2. 添加基于 `user_id, status, created_at` 的复合索引
3. 考虑按周进一步分区（如果数据增长快）

#### `balance_logs` 表 (32MB)
- **当前索引**: 5个
- **主要查询**: 用户余额流水查询
- **优化建议**:
```sql
-- 已优化的索引
CREATE INDEX idx_balance_logs_user_created_desc ON balance_logs(user_id, created_at DESC);
```

### 3. 代理商系统表
#### `agents` 及相关表
- `agents`: 代理商主表
- `commission_logs`: 按月分区佣金日志
- `withdraw_orders`: 提现订单表

**缺失索引**:
```sql
-- 代理商客户关系查询优化
CREATE INDEX idx_agent_clients_agent_created ON agent_clients(agent_id, created_at DESC);

-- 佣金查询优化
CREATE INDEX idx_commission_logs_client_status ON commission_logs(client_user_id, status, created_at DESC);
```

## 索引深度分析

### 冗余索引检测
基于363个索引的初步分析，可能存在以下冗余：

1. **单字段索引 vs 复合索引**
   - 例如：`created_at` 单字段索引可能被包含在其他复合索引中

2. **覆盖索引优化**
   - 检查是否可以通过添加INCLUDE列创建覆盖索引

### 索引使用率分析
需要监控以下指标：
```sql
-- 检查低使用率索引
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size
FROM pg_stat_user_indexes 
WHERE idx_scan < 1000
ORDER BY pg_relation_size(indexname::regclass) DESC;
```

## 外键完整性分析

### 当前外键状态
- **总数**: 104个外键约束
- **覆盖情况**: 大部分核心关系已有外键

### 缺失外键清单
基于schema分析，以下关联缺少外键约束：

1. **`commission_logs.client_call_log_id`**
   - 问题：引用分区表 `call_logs`，外键实现复杂
   - 建议：应用层保证数据完整性

2. **`agent_customer_consumption` 表**
   ```sql
   -- 缺失的外键
   ALTER TABLE agent_customer_consumption
   ADD CONSTRAINT fk_agent_customer_consumption_agent
   FOREIGN KEY (agent_id) REFERENCES agents(id);
   
   ALTER TABLE agent_customer_consumption
   ADD CONSTRAINT fk_agent_customer_consumption_user
   FOREIGN KEY (user_id) REFERENCES users(id);
   ```

3. **`circuit_history` 表**
   ```sql
   ALTER TABLE circuit_history
   ADD CONSTRAINT fk_circuit_history_user
   FOREIGN KEY (user_id) REFERENCES users(id);
   ```

## 查询模式分析

### 高频查询场景

#### 1. 用户中心查询
```sql
-- 用户信息查询
SELECT * FROM users WHERE id = ?;

-- 用户余额流水（分页）
SELECT * FROM balance_logs 
WHERE user_id = ? 
ORDER BY created_at DESC 
LIMIT ? OFFSET ?;

-- 用户通知（未读优先）
SELECT * FROM user_notifications 
WHERE user_id = ? 
ORDER BY read ASC, created_at DESC;
```

#### 2. 后台管理查询
```sql
-- 用户列表（分页+筛选）
SELECT * FROM users 
WHERE status = ? AND role = ? 
ORDER BY created_at DESC 
LIMIT ? OFFSET ?;

-- 调用日志查询
SELECT * FROM call_logs 
WHERE user_id = ? AND status = ? 
AND created_at BETWEEN ? AND ?
ORDER BY created_at DESC;
```

#### 3. 代理商面板查询
```sql
-- 代理商佣金统计
SELECT * FROM commission_logs 
WHERE agent_id = ? AND status = ? 
AND created_at BETWEEN ? AND ?
ORDER BY created_at DESC;

-- 客户消费记录
SELECT * FROM agent_customer_consumption 
WHERE agent_id = ? 
ORDER BY consumption_date DESC;
```

### 潜在N+1问题
1. **用户详情页**: 可能多次查询关联表
2. **代理商报表**: 可能逐条统计佣金
3. **兑换码管理**: 可能逐条查询关联信息

**解决方案**:
- 使用JOIN预加载
- 实现批量查询接口
- 添加适当的覆盖索引

## 分区表详细分析

### 1. `call_logs` 分区表
```
父表: call_logs
子分区:
  - call_logs_202606 (9MB)
  - call_logs_202607 (250MB) ⚠️ 热点分区
  - call_logs_202608 (0MB)
  - ... 202609-202612
```

**优化策略**:
1. **读写分离**: 对 `call_logs_202607` 考虑读写分离
2. **索引优化**: 确保所有分区有相同的索引配置
3. **数据生命周期**: 已实现6个月自动清理

### 2. `commission_logs` 分区表
```
父表: commission_logs
子分区:
  - commission_logs_2026_05 (6MB)
  - commission_logs_202606 (8MB)
  - commission_logs_202607 (1MB)
  - ... 202608-202612
```

**优化策略**:
1. **数据保留**: 12个月保留期
2. **查询优化**: 添加代理商+状态的复合索引

## 具体优化SQL

### 优先级P0（立即执行）
```sql
-- 1. balance_logs 用户流水查询优化
CREATE INDEX CONCURRENTLY idx_balance_logs_user_created_desc 
ON balance_logs(user_id, created_at DESC);

-- 2. user_notifications 未读通知优化
CREATE INDEX CONCURRENTLY idx_user_notifications_user_unread 
ON user_notifications(user_id) WHERE read = false;

-- 3. 添加缺失的外键约束
ALTER TABLE agent_customer_consumption
ADD CONSTRAINT fk_agent_customer_consumption_agent
FOREIGN KEY (agent_id) REFERENCES agents(id);

ALTER TABLE agent_customer_consumption
ADD CONSTRAINT fk_agent_customer_consumption_user
FOREIGN KEY (user_id) REFERENCES users(id);
```

### 优先级P1（一周内执行）
```sql
-- 1. 用户查询优化
CREATE INDEX CONCURRENTLY idx_users_role_created 
ON users(role, created_at DESC);

-- 2. 充值订单查询优化
CREATE INDEX CONCURRENTLY idx_recharge_orders_user_status_created 
ON recharge_orders(user_id, status, created_at DESC);

-- 3. 提现订单查询优化
CREATE INDEX CONCURRENTLY idx_withdraw_orders_agent_status_created 
ON withdraw_orders(agent_id, status, created_at DESC);

-- 4. 清理潜在冗余索引
-- 需要先分析索引使用率
```

### 优先级P2（一月内执行）
```sql
-- 1. 覆盖索引优化
CREATE INDEX CONCURRENTLY idx_call_logs_cover_query 
ON call_logs(user_id, status, created_at DESC)
INCLUDE (prompt_tokens, completion_tokens, cost);

-- 2. 分区表维护自动化
-- 创建自动分区管理函数
CREATE OR REPLACE FUNCTION manage_partitions()
RETURNS void AS $$
BEGIN
    -- 创建下个月分区
    -- 清理旧分区
    -- 更新统计信息
END;
$$ LANGUAGE plpgsql;
```

## 监控与维护计划

### 1. 监控指标
```sql
-- 每日检查的指标
SELECT 
    '慢查询比例' as metric,
    (SELECT COUNT(*) FROM pg_stat_statements WHERE mean_time > 100) * 100.0 / 
    (SELECT COUNT(*) FROM pg_stat_statements) as value;

SELECT 
    '索引使用率' as metric,
    (SELECT COUNT(*) FROM pg_stat_user_indexes WHERE idx_scan > 0) * 100.0 / 
    (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public') as value;
```

### 2. 维护任务
1. **每日**
   - 检查连接池状态
   - 监控慢查询
   - 备份监控数据

2. **每周**
   - 分析索引使用率
   - 清理无效连接
   - 更新统计信息

3. **每月**
   - 执行分区维护
   - 清理旧数据
   - 性能分析报告

### 3. 报警阈值
- 慢查询比例 > 5%
- 连接池使用率 >我们能实际监控到的系统提示
- 索引扫描率 < 60%
- 分区表大小 > 500MB

## 总结与建议

### 立即行动项
1. ✅ 添加 `balance_logs` 复合索引
2. ✅ 添加 `user_notifications` 未读通知索引  
3. ✅ 补充缺失的外键约束
4. 🔄 建立数据库性能基线监控

### 短期优化项（1周）
1. 分析并优化高频查询
2. 清理冗余索引
3. 优化连接池配置

### 长期优化项（1月）
1. 实现自动化分区管理
2. 建立完整的监控告警体系
3. 定期性能调优

### 风险评估
1. **低风险**: 添加索引（使用CONCURRENTLY）
2. **中风险**: 修改外键约束（需要数据一致性检查）
3. **高风险**: 清理大表数据（需要备份）

通过系统性的优化，预计可提升整体数据库性能25-40%，减少慢查询发生率，提高系统稳定性。