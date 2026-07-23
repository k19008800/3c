-- ============================================================
-- 3cloud 数据库性能优化索引
-- 创建时间：2026-07-23
-- 说明：修复高频查询缺失索引问题，优化查询性能
-- ============================================================

-- 1. call_logs 状态筛选索引（分区表）- 添加缺失分区的索引
-- 说明：用于后台按状态和时间筛选调用记录，支持分页查询
-- 注意：202607分区已有索引，但为了完整性仍然执行IF NOT EXISTS

-- 先创建索引
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_logs_202606_status_created 
ON call_logs_202606 (status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_logs_202607_status_created 
ON call_logs_202607 (status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_logs_202608_status_created 
ON call_logs_202608 (status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_logs_202609_status_created 
ON call_logs_202609 (status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_logs_202610_status_created 
ON call_logs_202610 (status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_logs_202611_status_created 
ON call_logs_202611 (status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_logs_202612_status_created 
ON call_logs_202612 (status, created_at DESC);

-- 后添加注释
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND tablename = 'call_logs_202607' 
        AND indexname = 'idx_call_logs_202607_status_created'
    ) THEN
        EXECUTE 'COMMENT ON INDEX idx_call_logs_202607_status_created IS ''call_logs状态+时间索引：按状态筛选并时间倒序，支持分页查询''';
    END IF;
END $$;

-- 2. balance_logs 用户流水索引 - 优化为DESC排序
-- 说明：用于用户中心查看余额变动流水，最新记录在前
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_balance_logs_user_created_desc 
ON balance_logs (user_id, created_at DESC);

DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND tablename = 'balance_logs' 
        AND indexname = 'idx_balance_logs_user_created_desc'
    ) THEN
        EXECUTE 'COMMENT ON INDEX idx_balance_logs_user_created_desc IS ''用户余额流水索引：按用户ID和时间倒序，用户中心最新流水查询''';
    END IF;
END $$;

-- 3. commission_logs 代理商佣金索引（分区表）- 添加缺失分区的索引
-- 说明：用于代理商佣金查询，按代理商、状态和时间排序
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commission_logs_202606_agent_status_created 
ON commission_logs_202606 (agent_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commission_logs_202607_agent_status_created 
ON commission_logs_202607 (agent_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commission_logs_202608_agent_status_created 
ON commission_logs_202608 (agent_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commission_logs_202609_agent_status_created 
ON commission_logs_202609 (agent_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commission_logs_202610_agent_status_created 
ON commission_logs_202610 (agent_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commission_logs_202611_agent_status_created 
ON commission_logs_202611 (agent_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commission_logs_202612_agent_status_created 
ON commission_logs_202612 (agent_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commission_logs_2026_05_agent_status_created 
ON commission_logs_2026_05 (agent_id, status, created_at DESC);

DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND tablename = 'commission_logs_202607' 
        AND indexname = 'idx_commission_logs_202607_agent_status_created'
    ) THEN
        EXECUTE 'COMMENT ON INDEX idx_commission_logs_202607_agent_status_created IS ''代理商佣金查询索引：按代理商、状态和时间倒序，佣金管理页面''';
    END IF;
END $$;

-- 4. recharge_orders 用户充值索引 - 优化包含status字段
-- 说明：用于用户充值记录查询，按用户、状态和时间排序
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recharge_orders_user_status_created 
ON recharge_orders (user_id, status, created_at DESC);

DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND tablename = 'recharge_orders' 
        AND indexname = 'idx_recharge_orders_user_status_created'
    ) THEN
        EXECUTE 'COMMENT ON INDEX idx_recharge_orders_user_status_created IS ''用户充值记录索引：按用户ID、状态和时间倒序，充值管理查询''';
    END IF;
END $$;

-- 5. withdraw_orders 提现审核索引
-- 说明：用于代理商提现审核查询，按代理商、状态和时间排序
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_withdraw_orders_agent_status_created 
ON withdraw_orders (agent_id, status, created_at DESC);

DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND tablename = 'withdraw_orders' 
        AND indexname = 'idx_withdraw_orders_agent_status_created'
    ) THEN
        EXECUTE 'COMMENT ON INDEX idx_withdraw_orders_agent_status_created IS ''代理商提现审核索引：按代理商ID、状态和时间倒序，提现审核列表''';
    END IF;
END $$;

-- 6. audit_logs 操作审计索引
-- 说明：用于操作审计查询，按操作员和时间排序
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_operator_created 
ON audit_logs (operator_id, created_at DESC);

DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND tablename = 'audit_logs' 
        AND indexname = 'idx_audit_logs_operator_created'
    ) THEN
        EXECUTE 'COMMENT ON INDEX idx_audit_logs_operator_created IS ''操作审计索引：按操作员ID和时间倒序，审计日志查询''';
    END IF;
END $$;

-- ============================================================
-- 索引创建完成
-- ============================================================