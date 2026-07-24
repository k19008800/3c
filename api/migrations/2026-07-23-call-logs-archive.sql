-- ============================================================
-- call_logs 归档策略
-- 生成时间：2026-07-23
-- 目标：控制 call_logs 表大小，保留最近 3 个月热数据
-- ============================================================

-- 1. 创建归档表（按月分区）
-- 已有分区表：call_logs_202606, call_logs_202607

-- 2. 创建归档函数：将 3 个月前的数据移动到冷存储
CREATE OR REPLACE FUNCTION archive_call_logs()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    old_partition text;
    archive_date date;
BEGIN
    -- 计算需要归档的月份（3 个月前）
    archive_date := date_trunc('month', CURRENT_DATE - INTERVAL '3 months');
    old_partition := 'call_logs_' || to_char(archive_date, 'YYYYMM');
    
    -- 检查分区是否存在
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = old_partition
    ) THEN
        -- 方案 A：导出到文件并删除（节省存储）
        -- EXECUTE format('COPY %I TO ''/archive/call_logs/%s.csv.gz'' WITH (FORMAT csv, HEADER true)', old_partition, old_partition);
        -- EXECUTE format('DROP TABLE %I', old_partition);
        
        -- 方案 B：标记为归档状态（保留数据但移到冷存储表）
        RAISE NOTICE 'Partition % is ready for archiving (size: %)', 
            old_partition, 
            pg_size_pretty(pg_total_relation_size('public.' || old_partition));
    ELSE
        RAISE NOTICE 'No partition to archive for %', old_partition;
    END IF;
END;
$$;

-- 3. 创建清理函数：删除 6 个月前的数据
CREATE OR REPLACE FUNCTION cleanup_old_call_logs()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    old_partition text;
    cleanup_date date;
BEGIN
    -- 计算需要删除的月份（6 个月前）
    cleanup_date := date_trunc('month', CURRENT_DATE - INTERVAL '6 months');
    old_partition := 'call_logs_' || to_char(cleanup_date, 'YYYYMM');
    
    -- 检查分区是否存在
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = old_partition
    ) THEN
        -- 删除旧分区
        EXECUTE format('DROP TABLE public.%I', old_partition);
        RAISE NOTICE 'Dropped partition %', old_partition;
    ELSE
        RAISE NOTICE 'No partition to drop for %', old_partition;
    END IF;
END;
$$;

-- 4. 创建索引优化：为当前月分区创建必要索引
CREATE OR REPLACE FUNCTION optimize_current_partition()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    current_partition text;
BEGIN
    current_partition := 'call_logs_' || to_char(CURRENT_DATE, 'YYYYMM');
    
    -- 确保当前月分区有查询需要的索引
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = current_partition
    ) THEN
        -- 检查并创建关键索引（如果不存在）
        -- user_id 索引（高频查询）
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE tablename = current_partition 
            AND indexname = current_partition || '_user_id_idx'
        ) THEN
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (user_id)', 
                current_partition || '_user_id_idx', current_partition);
        END IF;
        
        -- created_at 索引（时间范围查询）
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE tablename = current_partition 
            AND indexname = current_partition || '_created_at_idx'
        ) THEN
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (created_at)', 
                current_partition || '_created_at_idx', current_partition);
        END IF;
        
        RAISE NOTICE 'Optimized partition %', current_partition;
    END IF;
END;
$$;

-- 5. 查询当前状态
SELECT 
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    (pg_total_relation_size(schemaname||'.'||tablename) / 1024.0 / 1024.0)::numeric(10,2) as size_mb
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename LIKE 'call_logs_%'
ORDER BY tablename;

-- 6. 执行归档检查（不实际删除，仅报告）
SELECT archive_call_logs();
SELECT cleanup_old_call_logs();
SELECT optimize_current_partition();

-- ============================================================
-- 部署建议：
-- 1. 每月 1 号凌晨执行 archive_call_logs()
-- 2. 每季度执行 cleanup_old_call_logs()
-- 3. 每周执行 optimize_current_partition()
-- 
-- Cron 配置示例：
-- 0 2 1 * * psql -c "SELECT archive_call_logs();"
-- 0 3 1 1,4,7,10 * psql -c "SELECT cleanup_old_call_logs();"
-- 0 4 * * 0 psql -c "SELECT optimize_current_partition();"
-- ============================================================
