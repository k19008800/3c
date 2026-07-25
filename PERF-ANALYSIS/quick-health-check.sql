-- 3cloud 数据库快速健康检查
-- 运行时间: 2026-07-24

-- 1. 数据库基本信息
SELECT 
    current_database() AS database_name,
    version() AS postgres_version,
    pg_size_pretty(pg_database_size(current_database())) AS database_size;

-- 2. 表统计概览
SELECT 
    COUNT(*) AS table_count,
    SUM(n_live_tup) AS total_rows,
    pg_size_pretty(SUM(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname)))) AS total_size
FROM pg_stat_user_tables;

-- 3. 最大的10张表
SELECT 
    schemaname,
    relname AS tablename,
    n_live_tup AS row_count,
    pg_size_pretty(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname))) AS total_size,
    pg_size_pretty(pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname))) AS table_size,
    pg_size_pretty(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname)) - 
                   pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname))) AS index_size
FROM pg_stat_user_tables 
ORDER BY n_live_tup DESC 
LIMIT 10;

-- 4. 最活跃的10张表（按操作数）
SELECT 
    relname AS tablename,
    n_tup_ins + n_tup_upd + n_tup_del AS total_ops,
    n_tup_ins AS inserts,
    n_tup_upd AS updates,
    n_tup_del AS deletes,
    seq_scan AS full_scans,
    idx_scan AS index_scans,
    CASE 
        WHEN seq_scan + idx_scan > 0 
        THEN ROUND((seq_scan * 100.0) / (seq_scan + idx_scan), 2)
        ELSE 0 
    END AS full_scan_percent
FROM pg_stat_user_tables 
WHERE n_tup_ins + n_tup_upd + n_tup_del > 0
ORDER BY total_ops DESC 
LIMIT 10;

-- 5. 缺失外键索引检查（高风险）
SELECT 
    tc.table_name,
    STRING_AGG(kcu.column_name, ', ') AS foreign_key_columns,
    ccu.table_name AS referenced_table,
    COUNT(*) AS missing_index_count
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
    LEFT JOIN pg_indexes pi 
        ON pi.tablename = tc.table_name 
        AND pi.indexdef LIKE '%' || kcu.column_name || '%'
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_schema = 'public'
    AND pi.indexname IS NULL
GROUP BY tc.table_name, ccu.table_name
ORDER BY missing_index_count DESC
LIMIT 20;

-- 6. 大表缺少重要字段索引（中风险）
WITH large_tables AS (
    SELECT 
        relname AS tablename,
        n_live_tup AS row_count
    FROM pg_stat_user_tables 
    WHERE n_live_tup > 10000
),
common_query_fields AS (
    -- 常见查询字段模式
    SELECT 'created_at' AS field_name UNION ALL
    SELECT 'updated_at' UNION ALL
    SELECT 'status' UNION ALL
    SELECT 'user_id' UNION ALL
    SELECT 'model_name' UNION ALL
    SELECT 'ip' UNION ALL
    SELECT 'error_message'
)
SELECT 
    lt.tablename,
    lt.row_count,
    cqf.field_name,
    '可能需要索引' AS suggestion
FROM large_tables lt
CROSS JOIN common_query_fields cqf
WHERE EXISTS (
    SELECT 1 
    FROM information_schema.columns c
    WHERE c.table_name = lt.tablename
      AND c.table_schema = 'public'
      AND c.column_name = cqf.field_name
)
AND NOT EXISTS (
    SELECT 1 
    FROM pg_indexes pi
    WHERE pi.tablename = lt.tablename
      AND pi.schemaname = 'public'
      AND pi.indexdef LIKE '%' || cqf.field_name || '%'
)
ORDER BY lt.row_count DESC, lt.tablename, cqf.field_name;

-- 7. 索引使用效率（低使用率索引可能需要清理）
SELECT 
    schemaname,
    relname AS tablename,
    indexrelname AS indexname,
    idx_scan AS index_scans,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
    CASE 
        WHEN idx_scan = 0 THEN '从未使用'
        WHEN idx_scan < 100 THEN '极少使用'
        ELSE '正常使用'
    END AS usage_status
FROM pg_stat_user_indexes 
WHERE schemaname = 'public'
ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC
LIMIT 20;

-- 8. 分区表状态检查
SELECT 
    schemaname,
    relname AS partition_name,
    n_live_tup AS row_count,
    pg_size_pretty(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname))) AS partition_size,
    to_char(now() - pg_stat_file('base/' || pg_relation_filepath(relid)), 'DD"天"HH24"小时"') AS age
FROM pg_stat_user_tables 
WHERE relname LIKE 'call_logs_%' 
   OR relname LIKE 'commission_logs_%'
ORDER BY n_live_tup DESC;

-- 9. 数据库连接状态
SELECT 
    COUNT(*) AS total_connections,
    COUNT(*) FILTER (WHERE state = 'active') AS active_connections,
    COUNT(*) FILTER (WHERE state = 'idle') AS idle_connections,
    COUNT(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_transaction,
    MAX(AGE(now(), query_start)) AS longest_running_query
FROM pg_stat_activity 
WHERE datname = current_database()
  AND pid <> pg_backend_pid();

-- 10. 表空间使用情况
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) AS total_size,
    pg_size_pretty(pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) AS table_size,
    pg_size_pretty(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)) - 
                   pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) AS index_size,
    ROUND(
        (pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)) * 100.0) / 
        pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)),
        2
    ) AS table_percent,
    n_live_tup AS row_count,
    ROUND(n_live_tup::numeric / NULLIF(pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)), 0) * 8192, 2) AS rows_per_mb
FROM pg_stat_user_tables 
ORDER BY pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)) DESC
LIMIT 15;