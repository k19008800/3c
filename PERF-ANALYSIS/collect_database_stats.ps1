# Database Statistics Collection Script

$PGPASSWORD = "postgres"
$PSQL = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$DB = "threecloud"
$USER = "postgres"
$HOSTNAME = "localhost"

# Function to run SQL and get JSON output
function Get-PgJson($query) {
    $fullQuery = "SELECT json_agg(t) FROM ($query) t;"
    $result = & $PSQL -h $HOSTNAME -U $USER -d $DB -c $fullQuery 2>$null
    if ($LASTEXITCODE -eq 0) {
        try {
            $json = $result | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($json) { return $json } else { return @() }
        } catch {
            return @()
        }
    }
    return @()
}

# Function to run SQL and get text output
function Get-PgText($query) {
    $result = & $PSQL -h $HOSTNAME -U $USER -d $DB -c $query 2>$null
    if ($LASTEXITCODE -eq 0) {
        return $result
    }
    return $null
}

Write-Host "Collecting database statistics..." -ForegroundColor Green

# 1. Table statistics
Write-Host "1. Collecting table statistics..." -ForegroundColor Yellow
$tables = Get-PgJson @"
SELECT 
    table_name,
    pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size,
    (SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = table_name) as row_count
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY pg_total_relation_size(quote_ident(table_name)) DESC
"@

# 2. Index statistics
Write-Host "2. Collecting index statistics..." -ForegroundColor Yellow
$indexes = Get-PgJson @"
SELECT 
    schemaname,
    relname as tablename,
    indexrelname as indexname,
    idx_scan as index_scans,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
    CASE WHEN idx_scan = 0 THEN true ELSE false END as unused
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC
"@

$unusedIndexes = $indexes | Where-Object { $_.unused -eq $true }

# 3. Try to get slow queries
Write-Host "3. Checking pg_stat_statements..." -ForegroundColor Yellow
& $PSQL -h $HOSTNAME -U $USER -d $DB -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;" 2>$null
$slowQueries = Get-PgJson @"
SELECT 
    left(query, 200) as query_sample,
    calls,
    total_exec_time,
    mean_exec_time,
    rows
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20
"@

# 4. Foreign key analysis
Write-Host "4. Analyzing foreign keys..." -ForegroundColor Yellow
$missingForeignKeys = Get-PgJson @"
SELECT 
    kcu.table_name,
    kcu.column_name,
    kcu.constraint_name
FROM information_schema.key_column_usage kcu
LEFT JOIN information_schema.table_constraints tc
  ON kcu.constraint_name = tc.constraint_name
WHERE tc.constraint_type IS NULL
  AND kcu.column_name LIKE '%_id'
  AND kcu.table_schema = 'public'
ORDER BY kcu.table_name, kcu.column_name
"@

# 5. Partition table analysis
Write-Host "5. Analyzing partition tables..." -ForegroundColor Yellow
$partitions = Get-PgJson @"
SELECT 
    parent.relname AS parent_table,
    child.relname AS partition_name
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child ON pg_inherits.inhrelid = child.oid
ORDER BY parent_table, partition_name
"@

# 6. Database stats
Write-Host "6. Collecting database statistics..." -ForegroundColor Yellow
$dbStats = Get-PgJson @"
SELECT 
    (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') as table_count,
    (SELECT sum(n_live_tup) FROM pg_stat_user_tables) as total_rows,
    pg_size_pretty(pg_database_size('threecloud')) as database_size,
    version() as postgres_version,
    current_timestamp as analysis_time
"@

# Create output objects
$output = @{
    database_tables = $tables
    database_indexes = @{
        all_indexes = $indexes
        unused_indexes = $unusedIndexes
        unused_index_count = $unusedIndexes.Count
        total_index_count = $indexes.Count
    }
    slow_queries = $slowQueries
    foreign_keys = @{
        missing_foreign_keys = $missingForeignKeys
        missing_count = $missingForeignKeys.Count
    }
    partitions = $partitions
    statistics = $dbStats
}

# Write JSON files
$output.database_tables | ConvertTo-Json -Depth 3 | Out-File -FilePath "database-tables.json" -Encoding UTF8
$output.database_indexes | ConvertTo-Json -Depth 3 | Out-File -FilePath "database-indexes.json" -Encoding UTF8
$output.slow_queries | ConvertTo-Json -Depth 3 | Out-File -FilePath "database-slow-queries.json" -Encoding UTF8
$output.foreign_keys | ConvertTo-Json -Depth 3 | Out-File -FilePath "database-foreign-keys.json" -Encoding UTF8
$output.partitions | ConvertTo-Json -Depth 3 | Out-File -FilePath "database-partitions.json" -Encoding UTF8
$output.statistics | ConvertTo-Json -Depth 3 | Out-File -FilePath "database-stats.json" -Encoding UTF8

Write-Host "Statistics collected successfully!" -ForegroundColor Green
Write-Host "Files saved in current directory:" -ForegroundColor Cyan
dir *.json | Select-Object Name, Length