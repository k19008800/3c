-- ============================================================
-- 3cloud (3C) — 分区表自动清理函数（简化版）
-- 按照任务要求实现：删除超过6个月的分区
-- 支持 call_logs_YYYYMM 和 commission_logs_YYYYMM 分区表
-- ============================================================

-- 清理函数：删除超过保留期的旧分区
CREATE OR REPLACE FUNCTION cleanup_old_partitions()
RETURNS void AS $$
DECLARE
    partition_name text;
    cutoff_date date := current_date - interval '6 months';
    cutoff_commission date := current_date - interval '12 months';
    partition_suffix text;
BEGIN
    -- 1. 清理 call_logs 分区（保留 6 个月）
    FOR partition_name IN
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename LIKE 'call_logs_%'
        AND tablename < 'call_logs_' || to_char(cutoff_date, 'YYYYMM')
    LOOP
        BEGIN
            EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(partition_name) || ' CASCADE';
            RAISE NOTICE 'Dropped call_logs partition: %', partition_name;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to drop partition %: %', partition_name, SQLERRM;
        END;
    END LOOP;
    
    -- 2. 清理 commission_logs 分区（保留 12 个月）
    FOR partition_name IN
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename LIKE 'commission_logs_%'
        AND tablename < 'commission_logs_' || to_char(cutoff_commission, 'YYYYMM')
    LOOP
        BEGIN
            EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(partition_name) || ' CASCADE';
            RAISE NOTICE 'Dropped commission_logs partition: %', partition_name;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to drop partition %: %', partition_name, SQLERRM;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 注释
COMMENT ON FUNCTION cleanup_old_partitions() IS '清理超过保留期的旧分区表（call_logs: 6个月，commission_logs: 12个月）。';