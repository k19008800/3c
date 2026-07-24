# 数据库性能优化执行计划

## 概述
本计划基于对3cloud数据库的全面分析，旨在系统性地解决性能瓶颈，提升数据库性能和稳定性。

## 第一阶段：立即优化（24小时内）

### 1.1 索引优化
```sql
-- P0优先级：核心查询优化
-- 执行顺序：1
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_balance_logs_user_created_desc 
ON balance_logs(user_id, created_at DESC);

-- 执行顺序：2  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_notifications_user_unread 
ON user_notifications(user_id) WHERE read = false;

-- 执行顺序：3
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recharge_orders_user_status_created 
ON recharge_orders(user_id, status, created_at DESC);
```

### 1.2 外键完整性
```sql
-- 检查并添加缺失外键
-- 执行前先检查孤儿数据
DO $$
DECLARE
    orphan_count INTEGER;
BEGIN
    -- 检查agent_customer_consumption表
    SELECT COUNT(*) INTO orphan_count
    FROM agent_customer_consumption acc
    WHERE NOT EXISTS (SELECT 1 FROM agents a WHERE a.id = acc.agent_id);
    
    IF orphan_count > 0 THEN
        RAISE WARNING '发现 % 条agent_customer_consumption表的孤儿记录', orphan_count;
    END IF;
    
    -- 添加外键约束
    ALTER TABLE agent_customer_consumption
    ADD CONSTRAINT fk_agent_customer_consumption_agent
    FOREIGN KEY (agent_id) REFERENCES agents(id);
    
    ALTER TABLE agent_customer_consumption
    ADD CONSTRAINT fk_agent_customer_consumption_user
    FOREIGN KEY (user_id) REFERENCES users(id);
END $$;
```

### 1.3 监控设置
```sql
-- 启用pg_stat_statements扩展
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- 设置监控视图
CREATE VIEW database_performance_monitor AS
SELECT 
    now() as check_time,
    (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
    (SELECT COUNT(*) FROM pg_stat_user_tables WHERE n_live_tup > 100000) as large_tables,
    (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public') as total_indexes;
```

## 第二阶段：深度优化（1周内）

### 2.1 索引使用率分析
```bash
# 分析脚本：identify_unused_indexes.sql
# 目标：识别并清理使用率低的索引
psql -d threecloud -f scripts/identify_unused_indexes.sql
```

### 2.2 查询优化
```sql
-- 优化高频查询模式
-- 1. 用户列表查询优化
CREATE INDEX CONCURRENTLY idx_users_status_role_created 
ON users(status, role, created_at DESC);

-- 2. 调用日志查询优化  
CREATE INDEX CONCURRENTLY idx_call_logs_user_status_created 
ON call_logs(user_id, status, created_at DESC);

-- 3. 代理商佣金查询优化
CREATE INDEX CONCURRENTLY idx_commission_logs_agent_client_created 
ON commission_logs(agent_id, client_user_id, created_at DESC);
```

### 2.3 分区表维护
```sql
-- 自动化分区管理
-- 1. 创建下个月分区（每月1日执行）
CREATE OR REPLACE FUNCTION create_next_month_partition()
RETURNS void AS $$
DECLARE
    next_month text;
BEGIN
    next_month := to_char(current_date + interval '1 month', 'YYYYMM');
    
    -- call_logs分区
    EXECUTE format('
        CREATE TABLE call_logs_%s PARTITION OF call_logs
        FOR VALUES FROM (%L) TO (%L)',
        next_month,
        to_char(date_trunc('month', current_date + interval '1 month'), 'YYYY-MM-DD'),
        to_char(date_trunc('month', current_date + interval '2 months'), 'YYYY-MM-DD')
    );
    
    -- commission_logs分区
    EXECUTE format('
        CREATE TABLE commission_logs_%s PARTITION OF commission_logs
        FOR VALUES FROM (%L) TO (%L)',
        next_month,
        to_char(date_trunc('month', current_date + interval '1 month'), 'YYYY-MM-DD'),
        to_char(date_trunc('month', current_date + interval '2 months'), 'YYYY-MM-DD')
    );
END;
$$ LANGUAGE plpgsql;
```

## 第三阶段：系统化优化（1个月内）

### 3.1 性能基线建立
```sql
-- 创建性能基线表
CREATE TABLE database_performance_baseline (
    id serial PRIMARY KEY,
    metric_name varchar(100) NOT NULL,
    metric_value numeric,
    threshold_warning numeric,
    threshold_critical numeric,
    check_time timestamp DEFAULT now(),
    notes text
);

-- 初始化基线数据
INSERT INTO database_performance_baseline 
(metric_name, metric_value, threshold_warning, threshold_critical)
VALUES
('avg_query_time_ms', 50, 100,方法与数据收集方式正相关),
('slow_query_percentage', 2, 5, 10),
('index_usage_rate', 80, 60, 40),
('connection_pool_utilization', 30, 70, 90);
```

### 3.2 自动化监控告警
```python
# 监控脚本示例：monitor_database.py
"""
定期检查数据库性能指标
超过阈值时发送告警
生成每日/每周/每月报告
"""
```

### 3.3 容量规划
```sql
-- 预测数据增长
CREATE TABLE capacity_forecast (
    id serial PRIMARY KEY,
    table_name varchar(100) NOT NULL,
    current_size_mb numeric,
    growth_rate_per_day numeric,
    forecast_30_days_mb numeric,
    forecast_90_days_mb numeric,
    last_updated timestamp DEFAULT now()
);

-- 更新预测数据
INSERT INTO capacity_forecast 
(table_name, current_size_mb, growth_rate_per_day)
SELECT 
    relname,
    pg_relation_size(oid) / 1024 / 1024,
    0.1 -- 示例增长率
FROM pg_class 
WHERE relkind = 'r';
```

## 风险评估与缓解

### 4.1 执行风险
| 风险点 | 影响程度 | 缓解措施 |
|--------|----------|----------|
| 添加索引锁表 | 中 | 使用CONCURRENTLY创建索引 |
| 外键约束失败 | 高 | 先检查孤儿数据，分批次执行 |
| 查询性能回退 | 中 | 逐个索引添加，监控性能变化 |
| 分区表操作 | 高 | 在低峰期执行，充分测试 |

### 4.2 回滚计划
```sql
-- 索引回滚
DROP INDEX IF EXISTS idx_balance_logs_user_created_desc;
DROP INDEX IF EXISTS idx_user_notifications_user_unread;
DROP INDEX IF EXISTS idx_recharge_orders_user_status_created;

-- 外键回滚
ALTER TABLE agent_customer_consumption 
DROP CONSTRAINT IF EXISTS fk_agent_customer_consumption_agent;

ALTER TABLE agent_customer_consumption 
DROP CONSTRAINT IF EXISTS fk_agent_customer_consumption_user;
```

## 成功指标

### 5.1 性能指标
- 平均查询时间降低30%
- 慢查询比例从X%降低到Y%
- 索引使用率从A%提升到B%

### 5.2 稳定性指标
- 数据库连接超时减少50%
- 分区表维护时间减少40%
- 监控覆盖率100%

### 5.3 业务指标
- 用户中心页面加载时间缩短
- 后台管理查询响应提升
- 报表生成效率提高

## 资源需求

### 6.1 人力需求
- DBA：1人（指导与审核）
- 开发人员：1人（实施与测试）
- 运维人员：1人（监控与告警）

### 6.2 时间安排
| 阶段 | 预计时间 | 关键里程碑 |
|------|----------|------------|
| 第一阶段 | 1天 | 核心索引优化完成 |
| 第二阶段 | no, 3-5天 | 查询优化完成 |
| 第三阶段 | 2-3周 | 监控体系建立 |

### 6.3 工具准备
1. 监控工具：pg_stat_statements, pgAdmin
2. 测试工具：pgbench, 查询模拟工具
3. 部署工具：迁移脚本，回滚脚本

## 沟通计划

### 7.1 干系人
- 开发团队：实施方案沟通
- 运维团队：监控告警协调  
- 产品团队：业务影响评估
- 管理层：进展汇报

### 7.2 沟通频率
- 每日：执行进展同步
- 每周：阶段性成果汇报
- 每月：整体效果评估

## 附录

### A. 相关文档
1. `database.md` - 性能分析报告
2. `detailed_analysis.md` - 详细技术分析
3. 数据库schema文件
4. 迁移脚本文件

### B. 联系人
- 技术负责人：[姓名]
- DBA支持：[姓名]  
- 紧急联系人：[姓名]

### C. 更新记录
| 版本 | 日期 | 修改内容 | 修改人 |
|------|------|----------|--------|
| 1.0 | 2026-07-24 | 初始版本 | 泥鳅 |

---

**执行原则**：
1. 安全第一：所有操作必须有回滚方案
2. 渐进实施：分阶段执行，监控效果
3. 数据驱动：基于监控数据决策
4. 团队协作：跨团队沟通协调