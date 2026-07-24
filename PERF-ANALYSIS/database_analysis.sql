-- 数据库分析脚本
-- 执行时间：$(date)

-- 1. 表结构分析
\echo '=== 1. 表结构分析 ==='
SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY pg_total_relation_size(quote_ident(table_name)) DESC;

SELECT schemaname, relname, n_live_tup as row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;

-- 2. 索引使用率分析
\echo '=== 2. 索引使用率分析 ==='
SELECT schemaname, tablename, indexname, idx_scan as index_scans
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

SELECT schemaname, tablename, indexname,
       idx_scan,
       pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- 3. 尝试启用pg_stat_statements
\echo '=== 3. 尝试启用pg_stat_statements ==='
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- 4. 外键约束分析
\echo '=== 4. 外键约束分析 ==='
SELECT tc.table_name, tc.column_name
FROM information_schema.table_constraints tc
RIGHT JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type IS NULL
  AND kcu.column_name LIKE '%_id'
  AND kcu.table_schema = 'public';

-- 5. 分区表分析
\echo '=== 5. 分区表分析 ==='
SELECT parent.relname AS parent_table,
       child.relname AS partition_name
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child ON pg_inherits.inhrelid = child.oid;

-- 6. 数据库统计信息
\echo '=== 6. 数据库统计信息 ==='
SELECT 
    (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') as table_count,
    (SELECT sum(n_live_tup) FROM pg_stat_user_tables) as total_rows,
    pg_size_pretty(pg_database_size('threecloud')) as database_size;