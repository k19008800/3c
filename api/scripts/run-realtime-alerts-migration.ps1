# ============================================================
#  3cloud (3C) — 实时告警推送系统数据库迁移脚本
#  执行时间：2026-07-26
# ============================================================

param(
    [string]$Host = "localhost",
    [int]$Port = 5432,
    [string]$Database = "3cloud",
    [string]$Username = "postgres",
    [string]$Password = "postgres",
    [switch]$Help
)

if ($Help) {
    Write-Host @"
实时告警推送系统数据库迁移脚本

使用方法:
    .\run-realtime-alerts-migration.ps1 [-Host <host>] [-Port <port>] [-Database <database>] [-Username <username>] [-Password <password>] [-Help]

参数:
    -Host          PostgreSQL 主机地址 (默认: localhost)
    -Port          PostgreSQL 端口 (默认: 5432)
    -Database      数据库名称 (默认: 3cloud)
    -Username      用户名 (默认: postgres)
    -Password      密码 (默认: postgres)
    -Help          显示此帮助信息

示例:
    .\run-realtime-alerts-migration.ps1
    .\run-realtime-alerts-migration.ps1 -Host 127.0.0.1 -Database mydb -Username admin -Password secret

"@ -ForegroundColor Green
    exit 0
}

# 颜色输出函数
function Write-Colored {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Write-Success {
    param([string]$Message)
    Write-Colored "[✓] $Message" -Color Green
}

function Write-Error {
    param([string]$Message)
    Write-Colored "[✗] $Message" -Color Red
}

function Write-Info {
    param([string]$Message)
    Write-Colored "[i] $Message" -Color Cyan
}

function Write-Warning {
    param([string]$Message)
    Write-Colored "[!] $Message" -Color Yellow
}

# 检查 psql 是否可用
function Test-PsqlAvailable {
    try {
        $null = Get-Command psql -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

# 执行 SQL 文件
function Invoke-SqlFile {
    param(
        [string]$FilePath,
        [hashtable]$ConnectionParams
    )
    
    Write-Info "执行 SQL 文件: $(Split-Path $FilePath -Leaf)"
    
    $sqlContent = Get-Content $FilePath -Raw
    
    # 构建连接字符串
    $connString = "host=$($ConnectionParams.Host) port=$($ConnectionParams.Port) dbname=$($ConnectionParams.Database) user=$($ConnectionParams.Username) password=$($ConnectionParams.Password)"
    
    # 使用 psql 执行
    try {
        $output = & psql $connString -c $sqlContent -v ON_ERROR_STOP=1 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "SQL 文件执行成功"
            return $true
        } else {
            Write-Error "SQL 文件执行失败"
            Write-Error $output
            return $false
        }
    } catch {
        Write-Error "执行 SQL 文件时出错: $_"
        return $false
    }
}

# 检查数据库连接
function Test-DatabaseConnection {
    param([hashtable]$ConnectionParams)
    
    Write-Info "测试数据库连接..."
    
    $connString = "host=$($ConnectionParams.Host) port=$($ConnectionParams.Port) dbname=$($ConnectionParams.Database) user=$($ConnectionParams.Username) password=$($ConnectionParams.Password)"
    
    try {
        $testOutput = & psql $connString -c "SELECT 1;" -t 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "数据库连接成功"
            return $true
        } else {
            Write-Error "数据库连接失败: $testOutput"
            return $false
        }
    } catch {
        Write-Error "连接数据库时出错: $_"
        return $false
    }
}

# 备份现有表结构（可选）
function Backup-TableStructure {
    param([hashtable]$ConnectionParams)
    
    Write-Info "备份现有表结构..."
    
    $backupFile = "backup_table_structure_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"
    $connString = "host=$($ConnectionParams.Host) port=$($ConnectionParams.Port) dbname=$($ConnectionParams.Database) user=$($ConnectionParams.Username) password=$($ConnectionParams.Password)"
    
    try {
        # 备份现有表结构（不包括数据）
        $backupCmd = @"
SELECT 
    'CREATE TABLE IF NOT EXISTS ' || 
    quote_ident(n.nspname) || '.' || 
    quote_ident(c.relname) || E' (\n' || 
    array_to_string(
        array_agg(
            '    ' || 
            quote_ident(a.attname) || ' ' || 
            pg_catalog.format_type(a.atttypid, a.atttypmod) ||
            CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END ||
            CASE WHEN a.atthasdef THEN ' DEFAULT ' || pg_catalog.pg_get_expr(d.adbin, d.adrelid) ELSE '' END
        ), 
        E',\n'
    ) || E'\n);'
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE c.relkind = 'r' 
    AND n.nspname NOT IN ('pg_catalog', 'pg_toast', 'information_schema')
    AND a.attnum > 0 
    AND NOT a.attisdropped
    AND c.relname IN ('user_notification_subscriptions', 'user_notification_preferences', 'alert_push_history')
GROUP BY n.nspname, c.relname;
"@
        
        $backupOutput = & psql $connString -c $backupCmd -t 2>&1
        
        if ($LASTEXITCODE -eq 0 -and $backupOutput.Trim()) {
            $backupOutput | Out-File -FilePath $backupFile -Encoding UTF8
            Write-Success "表结构已备份到: $backupFile"
            return $true
        } else {
            Write-Warning "没有需要备份的现有表"
            return $true
        }
    } catch {
        Write-Warning "备份表结构时出错: $_"
        return $true  # 继续执行，备份不是必须的
    }
}

# 主函数
function Main {
    Write-Host @"
╔══════════════════════════════════════════════════════════╗
║  3cloud 实时告警推送系统 - 数据库迁移                    ║
╚══════════════════════════════════════════════════════════╝
"@ -ForegroundColor Magenta
    
    # 检查 psql
    if (-not (Test-PsqlAvailable)) {
        Write-Error "未找到 psql 命令。请确保 PostgreSQL 已安装并添加到 PATH"
        Write-Info "下载地址: https://www.postgresql.org/download/"
        exit 1
    }
    
    # 连接参数
    $connectionParams = @{
        Host = $Host
        Port = $Port
        Database = $Database
        Username = $Username
        Password = $Password
    }
    
    Write-Info "连接参数:"
    Write-Info "  主机: $Host"
    Write-Info "  端口: $Port"
    Write-Info "  数据库: $Database"
    Write-Info "  用户: $Username"
    
    # 测试连接
    if (-not (Test-DatabaseConnection -ConnectionParams $connectionParams)) {
        exit 1
    }
    
    # 备份现有表结构（可选）
    Backup-TableStructure -ConnectionParams $connectionParams
    
    # 确认执行
    Write-Warning "即将执行数据库迁移，这会添加新的表并可能修改现有枚举类型。"
    $confirmation = Read-Host "是否继续？(y/N)"
    
    if ($confirmation -ne 'y' -and $confirmation -ne 'Y') {
        Write-Info "已取消迁移"
        exit 0
    }
    
    # 执行迁移
    Write-Info "开始执行数据库迁移..."
    
    $migrationFile = Join-Path $PSScriptRoot "../src/db/migrations/20240726_add_real_time_alerts_tables.sql"
    
    if (-not (Test-Path $migrationFile)) {
        Write-Error "找不到迁移文件: $migrationFile"
        exit 1
    }
    
    if (Invoke-SqlFile -FilePath $migrationFile -ConnectionParams $connectionParams) {
        Write-Success "数据库迁移执行完成!"
        
        # 验证迁移结果
        Write-Info "验证迁移结果..."
        $verifyCmd = @"
SELECT 
    (SELECT COUNT(*) FROM user_notification_subscriptions) as subscription_count,
    (SELECT COUNT(*) FROM user_notification_preferences) as preference_count,
    (SELECT COUNT(*) FROM alert_push_history) as history_count
"@
        
        $verifyOutput = & psql $connectionString -c $verifyCmd -t 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "迁移验证成功"
            Write-Info "迁移摘要: $verifyOutput"
        }
        
        Write-Host @"
╔══════════════════════════════════════════════════════════╗
║  迁移完成!                                              ║
║                                                          ║
║  已创建的表:                                            ║
║  • user_notification_subscriptions                       ║
║  • user_notification_preferences                         ║
║  • alert_push_history                                    ║
║                                                          ║
║  后续步骤:                                              ║
║  1. 重启 API 服务器以加载新的路由                       ║
║  2. 在前端项目中导入新的组件                            ║
║  3. 测试 WebSocket 连接和通知推送                       ║
╚══════════════════════════════════════════════════════════╝
"@ -ForegroundColor Green
        
    } else {
        Write-Error "数据库迁移执行失败!"
        exit 1
    }
}

# 执行主函数
Main