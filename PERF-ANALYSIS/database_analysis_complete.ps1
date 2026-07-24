$env:PGPASSWORD="postgres"
$psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$db = "threecloud"
$user = "postgres"
$host = "localhost"

Write-Host "Starting database analysis..."

# 1. Table structure analysis
Write-Host "1. Table structure analysis..."
& $psql -h $host -U $user -d $db -c @"
SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY pg_total_relation_size(quote_ident(table_name)) DESC;
"@ | Out-File -FilePath "3cloud/PERF-ANALYSIS/table_sizes.txt" -Encoding UTF8

& $psql -h $host -U $user -d $db -c @"
SELECT schemaname, relname, n_live_tup as row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
"@ | Out-File -FilePath "3cloud/PERF-ANALYSIS/table_row_counts.txt" -Encoding UTF8 -Append

# 2. Index usage analysis
Write-Host "2. Index usage analysis..."
& $psql -h $host -U $user -d $db -c @"
SELECT schemaname, tablename, indexname, idx_scan as index_scans
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
"@ | Out-File -FilePath "3cloud/PERF-ANALYSIS/unused_indexes.txt" -Encoding UTF8

& $psql -h $host -U $user -d $db -c @"
SELECT schemaname, tablename, indexname,
       idx_scan,
       pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
"@ | Out-File -FilePath "3cloud/PERF-ANALYSIS/index_usage.txt" -Encoding UTF8 -Append

# 3. Slow query analysis
Write-Host "3. Enable pg_stat_statements..."
& $psql -h $host -U $user -d $db -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"

& $psql -h $host -U $user -d $db -c @"
SELECT query, calls, total_exec_time, mean_exec_time, rows
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
"@ | Out-File -FilePath "3cloud/PERF-ANALYSIS/slow_queries.txt" -Encoding UTF8 2>$null

# 4. Foreign key analysis
Write-Host "4. Foreign key analysis..."
& $psql -h $host -U $user -d $db -c @"
SELECT kcu.table_name, kcu.column_name
FROM information_schema.key_column_usage kcu
LEFT JOIN information_schema.table_constraints tc
  ON kcu.constraint_name = tc.constraint_name
WHERE tc.constraint_type IS NULL
  AND kcu.column_name LIKE '%_id'
  AND kcu.table_schema = 'public';
"@ | Out-File -FilePath "3cloud/PERF-ANALYSIS/missing_foreign_keys.txt" -Encoding UTF8

# 5. Partition table analysis
Write-Host "5. Partition table analysis..."
& $psql -h $host -U $user -d $db -c @"
SELECT parent.relname AS parent_table,
       child.relname AS partition_name
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child ON pg_inherits.inhrelid = child.oid;
"@ | Out-File -FilePath "3cloud/PERF-ANALYSIS/partition_tables.txt" -Encoding UTF8

# 6. Database statistics
Write-Host "6. Database statistics..."
& $psql -h $host -U $user -d $db -c @"
SELECT 
    (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') as table_count,
    (SELECT sum(n_live_tup) FROM pg_stat_user_tables) as total_rows,
    pg_size_pretty(pg_database_size('threecloud')) as database_size;
"@ | Out-File -FilePath "3cloud/PERF-ANALYSIS/database_stats.txt" -Encoding UTF8

Write-Host "Analysis completed!"