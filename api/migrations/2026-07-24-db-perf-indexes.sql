-- ============================================================
--  3cloud (3C) — 性能优化索引迁移 (P0优先级)
--  日期：2026-07-24
--  用途：添加缺失的分析索引和分区表索引同步
-- ============================================================

-- ── 1. call_logs 分析索引（P0缺失索引） ──
-- 用途：分析查询优化，支持按模型、IP、时长进行统计分析
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_logs_202607_analysis 
ON call_logs_202607 (model_name, ip, duration_ms);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_logs_202608_analysis 
ON call_logs_202608 (model_name, ip, duration_ms);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_logs_202609_analysis 
ON call_logs_202609 (model_name, ip, duration_ms);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_logs_202610_analysis 
ON call_logs_202610 (model_name, ip, duration_ms);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_logs_202611_analysis 
ON call_logs_202611 (model_name, ip, duration_ms);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_logs_202612_analysis 
ON call_logs_202612 (model_name, ip, duration_ms);

-- 历史月份分区表（如果需要）
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_logs_202606_analysis 
ON call_logs_202606 (model_name, ip, duration_ms);

-- ── 2. 分区表索引同步检查 ──
-- 确保所有call_logs分区表都有标准索引集
DO $$
DECLARE
    partition RECORD;
    missing_indexes TEXT[];
BEGIN
    -- 检查每个分区表是否都有标准索引
    FOR partition IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE tablename LIKE 'call_logs_%' 
        AND schemaname = 'public'
    LOOP
        missing_indexes := ARRAY[]::TEXT[];
        
        -- 检查status_created索引
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE tablename = partition.tablename 
            AND indexname LIKE '%status_created%'
        ) THEN
            missing_indexes := missing_indexes || 'status_created';
        END IF;
        
        -- 检查user_created索引
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE tablename = partition.tablename 
            AND indexname LIKE '%user_created%'
        ) THEN
            missing_indexes := missing_indexes || 'user_created';
        END IF;
        
        -- 检查vendor_created索引
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE tablename = partition.tablename 
            AND indexname LIKE '%vendor_created%'
        ) THEN
            missing_indexes := missing_indexes || 'vendor_created';
        END IF;
        
        -- 检查api_key_created索引
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE tablename = partition.tablename 
            AND indexname LIKE '%api_key_created%'
        ) THEN
            missing_indexes := missing_indexes || 'api_key_created';
        END IF;
        
        IF array_length(missing_indexes, 1) > 0 THEN
            RAISE NOTICE '分区表 % 缺少索引: %', partition.tablename, array_to_string(missing_indexes, ', ');
        END IF;
    END LOOP;
END $$;

-- ── 3. commission_logs 分区表索引同步 ──
-- 确保所有commission_logs分区表都有标准索引
DO $$
DECLARE
    partition RECORD;
    missing_indexes TEXT[];
BEGIN
    FOR partition IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE tablename LIKE 'commission_logs_%' 
        AND schemaname = 'public'
    LOOP
        missing_indexes := ARRAY[]::TEXT[];
        
        -- 检查agent_status_created索引
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE tablename = partition.tablename 
            AND indexname LIKE '%agent_status_created%'
        ) THEN
            missing_indexes := missing_indexes || 'agent_status_created';
        END IF;
        
        -- 检查status_created索引
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE tablename = partition.tablename 
            AND indexname LIKE '%status_created%'
        ) THEN
            missing_indexes := missing_indexes || 'status_created';
        END IF;
        
        IF array_length(missing_indexes, 1) > 0 THEN
            RAISE NOTICE '佣金分区表 % 缺少索引: %', partition.tablename, array_to_string(missing_indexes, ', ');
        END IF;
    END LOOP;
END $$;

-- ── 4. 外键约束验证 ──
-- 检查已存在的外键约束
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

-- ── 5. 索引创建验证 ──
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename LIKE 'call_logs_%' 
    AND indexname LIKE '%analysis%'
ORDER BY tablename, indexname;