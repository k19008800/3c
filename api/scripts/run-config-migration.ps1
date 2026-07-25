# ============================================================
#  3cloud (3C) — 配置版本控制迁移脚本 (PowerShell)
#  执行 config_versions 相关表的迁移
# ============================================================

Write-Host "🔧 开始执行配置版本控制迁移..." -ForegroundColor Cyan

# 检查当前目录
$currentDir = Get-Location
Write-Host "当前目录: $currentDir" -ForegroundColor Gray

# 检查迁移文件是否存在
$migrationFile = "drizzle\migrations\0003_add_config_versions.sql"
if (-not (Test-Path $migrationFile)) {
    Write-Host "❌ 迁移文件不存在: $migrationFile" -ForegroundColor Red
    exit 1
}

Write-Host "✅ 迁移文件存在: $migrationFile" -ForegroundColor Green

# 检查数据库连接
Write-Host "🔍 检查数据库连接..." -ForegroundColor Cyan
try {
    $checkOutput = npx drizzle-kit check 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ 数据库连接正常" -ForegroundColor Green
    } else {
        Write-Host "❌ 数据库连接失败" -ForegroundColor Red
        Write-Host $checkOutput -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ 检查数据库连接时出错: $_" -ForegroundColor Red
    exit 1
}

# 应用迁移
Write-Host "🚀 应用迁移到数据库..." -ForegroundColor Cyan
try {
    # 使用drizzle-kit直接执行SQL文件
    $envContent = Get-Content ".env" -ErrorAction SilentlyContinue
    $dbUrl = ""
    foreach ($line in $envContent) {
        if ($line.StartsWith("DATABASE_URL=")) {
            $dbUrl = $line.Substring(13)
            break
        }
    }
    
    if (-not $dbUrl) {
        $dbUrl = "postgres://postgres:postgres@localhost:5432/threecloud"
    }
    
    Write-Host "📊 数据库URL: $dbUrl" -ForegroundColor Gray
    
    # 读取迁移SQL
    $sqlContent = Get-Content $migrationFile -Raw
    
    # 分割SQL语句
    $sqlStatements = $sqlContent -split ';' | Where-Object { $_ -match '\S' }
    
    Write-Host "📈 准备执行 $($sqlStatements.Count) 条SQL语句..." -ForegroundColor Cyan
    
    # 这里可以使用pg.js或其他方式执行SQL
    # 由于环境限制，这里只是显示SQL内容
    Write-Host "⚠️  注意: 需要手动执行SQL迁移" -ForegroundColor Yellow
    Write-Host "📄 SQL文件路径: $((Get-Item $migrationFile).FullName)" -ForegroundColor Gray
    
    # 生成一个可以直接执行的SQL文件
    $executableSql = @"
-- ============================================================
-- 3cloud (3C) — 配置版本控制迁移SQL
-- 请手动在PostgreSQL中执行此文件
-- ============================================================

BEGIN;

$sqlContent

COMMIT;
"@
    
    $outputFile = "config_versions_migration.sql"
    $executableSql | Out-File -FilePath $outputFile -Encoding UTF8
    
    Write-Host "✅ 已生成可直接执行的SQL文件: $outputFile" -ForegroundColor Green
    Write-Host "📋 请将此文件导入到PostgreSQL数据库" -ForegroundColor Yellow
    
} catch {
    Write-Host "❌ 应用迁移时出错: $_" -ForegroundColor Red
    exit 1
}

Write-Host "🎉 配置版本控制迁移准备完成!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 下一步操作:" -ForegroundColor Cyan
Write-Host "1. 将生成的 $outputFile 导入PostgreSQL数据库" -ForegroundColor White
Write-Host "2. 验证迁移结果:" -ForegroundColor White
Write-Host "   SELECT * FROM config_versions LIMIT 1;" -ForegroundColor Gray
Write-Host "3. 重启API服务以加载新的schema" -ForegroundColor White
Write-Host ""
Write-Host "🔧 新增功能:" -ForegroundColor Cyan
Write-Host "• 配置版本历史追踪" -ForegroundColor White
Write-Host "• 配置快照管理" -ForegroundColor White
Write-Host "• 变更审批流程" -ForegroundColor White
Write-Host "• 配置变更影响评估" -ForegroundColor White