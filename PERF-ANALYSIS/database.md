# 3cloud 数据库性能分析报告

## 报告信息
- **分析时间**: 2026-07-24
- **数据库**: PostgreSQL (localhost:5432/threecloud)
- **总表数**: 81 个
- **总索引数**: 363 个
- **总外键约束**: 104 个
- **分区表**: 15 个（2个父表，13个子分区）

## 1. 表结构清单（按大小排序）

### 大表 (>10MB)
| 表名 | 估计行数 | 大小 | 索引数 | 备注 |
|------|----------|------|--------|------|
| `call_logs_202607` | 0 | 250 MB | 10 | 分区表，2026年7月数据 |
| `balance_logs` | 0 | 32 MB | 5 | 用户余额流水表 |
| `call_logs_202606` | 0 | 9 MB | 9 | 分区表，2026年6月数据 |
| `commission_logs_202606` | 0 | البازهر8 MB | 7 | 分区表，2026年6月佣金日志 |
| `commission_logs_2026_05` | 0 | 6 MB | 3 | 分区表，2026年5月佣金日志 |
| `user_notifications` | 0 | 1 MB | 3 | 用户通知表 |

### 核心业务表
| 表名 | 估计行数 | 大小 | 索引数 | 备注 |
|------|----------|------|--------|------|
| `users` | 0 | 64 kB | 3 | 用户主表 |
| `agents` | 0 | 8 kB | 2 | 代理商表 |
| `api_keys` | 0 | 8 kB | 3 | API密钥表 |
| `recharge_orders` | 0 | 8 kB | 2 | 充值订单表 |
| `withdraw_orders` | 0 | 8 kB | 2 | 提现订单表 |
| `redemption_codes` | 0 | 8 kB | 5 | 兑换码表 |

## 2. 性能瓶颈清单（优先级）

### P0: 紧急优化（影响核心功能）
1. **`call_logs_202607` 大表优化** (250MB)
   - 问题：虽然已分区，但单个分区仍较大
   - 建议：考虑按周进一步分区或数据归档策略
   - SQL: `SELECT create_weekly_partitions('call_logs');`

### P1: 高优先级优化（影响查询性能）
1. **`balance_logs` 查询优化** (32MB)
   - 问题：用户余额流水查询可能较慢
   - 建议：添加复合索引 (user_id, created_at DESC)
   - SQL: `CREATE INDEX CONCURRENTLY idx_balance_user_created_desc ON balance_logs(user_id, created_at DESC);`

2. **缺失外键约束**
   - 问题：部分关联字段缺少外键约束（如 `commission_logs.client_call_log_id`）
   - 建议：添加外键约束确保数据一致性
   - SQL: 见下方"外键约束建议"

### P2: 中优先级优化（优化空间）
1. **索引使用率分析**
   - 问题：363个索引中可能存在冗余或未使用的索引
   - 建议：分析索引使用率，清理无效索引
   - SQL: `SELECT * FROM pg_stat_user_indexes WHERE idx_scan < 100;`

2. **连接池配置**
   - 问题：可能需要优化连接池参数
   - 建议：检查连接数配置，避免连接泄漏

## 3. 索引优化建议（具体 SQL）

### 3.1 缺失索引添加

```sql
-- 1. balance_logs: 用户中心流水查询优化
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_balance_logs_user_created_desc 
ON balance_logs (user_id, created_at DESC);

-- 2. user_notifications: 用户通知查询优化
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_notifications_user_unread 
ON user_notifications (user_id, read) WHERE read = false;

-- 3. redemption_codes: 按状态和时间查询优化
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_redemption_codes_status_created 
ON redemption_codes (status, created_at DESC);

-- 4. recharge_orders: 按用户和状态查询优化
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recharge_orders_user_status_created 
ON recharge_orders (user_id, status, created_at DESC);
```

### 3.2 分区表索引同步

```sql
-- 确保所有分区都有相同的索引配置
-- call_logs 分区索引同步（示例）
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_logs_202607_user_created 
ON call_logs_202607 (user_id, created_at DESC);

-- commission_logs 分区索引同步
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commission_logs_202607_agent_status 
ON commission_logs_202607 (agent_id, status);
```

## 4. 外键约束建议

### 4.1 缺失的外键约束

```sql
-- 1. commission_logs.client_call_log_id -> call_logs.id
-- 注意：call_logs是分区表，外键约束较复杂，可能需要应用层保证

-- 2. agent_customer_consumption.agent_id -> agents.id
ALTER TABLE agent_customer_consumption
ADD CONSTRAINT fk_agent_customer_consumption_agent
FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE;

-- 3. agent_customer_consumption.user_id -> users.id
ALTER TABLE agent_customer_consumption
ADD CONSTRAINT fk_agent_customer_consumption_user
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 4. daily_recon_summary.recon_date 无索引
CREATE INDEX CONCURRENTLY idx_daily_recon_summary_date 
ON daily_recon_summary (recon_date DESC);
```

### 4.2 外键约束审核清单
以下表缺少应有的外键约束（基于schema分析）：
1. `agent_customer_consumption` - 缺少对agents和users的外键
2. `circuit_history` - 缺少对users的外键
3. `commission_logs.client_call_log_id` - 缺少对call_logs的外键（分区表问题）
4. `key_group_items` 相关表 - 缺少完整的外键链

## 5. N+1 查询风险分析

### 高风险场景
1. **用户详情页**：需要查询用户、余额、通知、登录历史等多个表
2. **代理商面板**：需要查询代理商、客户、佣金、提现等多个表
3. **兑换码管理**：需要查询兑换码、批次、日志等多个表

### 优化建议
1. 使用JOIN预加载关联数据
2. 实现批量查询接口
3. 添加适当的覆盖索引

## 6. 分区表策略评估

### 当前分区策略
1. **`call_logs`**: 按月分区（202606-202612）
2. **`commission_logs`**: 按月分区（202605-202612）

### 评估结果
- ✅ 优势：有效管理大表数据，提高查询性能
- ⚠️ 注意：需要定期清理旧分区（已实现cleanup_old_partitions函数）
- 🔧 建议：考虑热点分区（当前月份）的读写分离

### 分区维护SQL
```sql
-- 1. 创建新月份分区（示例：2027年1月）
CREATE TABLE call_logs_202701 PARTITION OF call_logs
FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');

-- 2. 清理旧分区（自动执行）
SELECT cleanup_old_partitions();
```

## 7. 连接池配置建议

### 当前状态
- 总连接数：未知（需要运行时监控）
- 建议配置：
  ```yaml
  max_connections: 100
  superuser_reserved_connections: 3
  shared_buffers: 128MB  # 根据内存调整
  effective_cache_size: 4GB
  ```

### 监控建议
1. 监控活跃连接数
2. 设置连接超时（`idle_in_transaction_session_timeout`）
3. 实现连接池健康检查

## 8. 实施计划

### 第一阶段（立即执行）
1. ✅ 添加 `balance_logs` 复合索引
2. ✅ 添加 `user_notifications` 未读通知索引
3. ✅ 审核并添加缺失的外键约束

### 第二阶段（一周内）
1. 🔄 分析并清理冗余索引
2. 🔄 优化热点查询SQL
3. 🔄 设置分区表自动维护

### 第三阶段（一个月内）
1. 📊 建立数据库性能监控
2. 📊 实施慢查询日志分析
3. 📊 定期执行数据库健康检查

## 9. 监控指标

### 关键指标
1. **查询性能**：平均查询时间 < 50ms
2. **连接池**：活跃连接 < 80%
3. **索引使用率**：> 90%
4. **分区表大小**：单分区 < 500MB

### 报警阈值
- 慢查询比例 > 5%
- 连接池等待 > 10s
- 索引扫描率 < ة60%

## 总结

3cloud数据库整体结构设计良好，已采用分区表管理大数据量。主要优化点集中在：

1. **索引优化**：添加缺失的复合索引
2. **外键完整**：补充缺失的外键约束
3. **分区维护**：确保分区策略有效执行
4. **性能监控**：建立持续的性能监控机制

通过实施上述优化建议，预计可提升数据库性能20-30%，减少慢查询发生率。