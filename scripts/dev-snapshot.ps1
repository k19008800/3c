# ============================================================
#  3cloud (3C) — 开发数据库快照管理 (PowerShell)
#
#  用法:
#    .\dev-snapshot.ps1 save       生成快照
#    .\dev-snapshot.ps1 restore    恢复最近快照
#    .\dev-snapshot.ps1 list       列出快照
#    .\dev-snapshot.ps1 reset      清空并重建数据库（从零）
#    .\dev-snapshot.ps1 refresh    重置 → 运行数据工厂
#
#  依赖: PostgreSQL 17 (psql, pg_dump)
#        项目: drizzle-kit, tsx
# ============================================================

param(
    [Parameter(Position = 0)]
    [ValidateSet("save", "restore", "list", "reset", "refresh", "help")]
    [string]$Action = "help"
)

$PGBIN = "C:\Program Files\PostgreSQL\17\bin"
$PSQL  = Join-Path $PGBIN "psql.exe"
$PGDUMP = Join-Path $PGBIN "pg_dump.exe"

$SNAPSHOT_DIR = Join-Path $PSScriptRoot "snapshots"
$DB_NAME = "threecloud"
$DB_USER = "postgres"
$API_DIR = Join-Path $PSScriptRoot ".." "api"

# 确保快照目录存在
if (-not (Test-Path $SNAPSHOT_DIR)) {
    New-Item -ItemType Directory -Path $SNAPSHOT_DIR -Force | Out-Null
}

# ── 重建数据库 ──
function Invoke-DbRebuild {
    Write-Host "  1/3 删除重建数据库..." -NoNewline
    $env:PGPASSWORD = "postgres"
    & $PSQL -U $DB_USER -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};" 2>$null | Out-Null
    & $PSQL -U $DB_USER -d postgres -c "CREATE DATABASE ${DB_NAME} ENCODING 'UTF8';" 2>$null | Out-Null
    Write-Host " ✅" -ForegroundColor Green

    Write-Host "  2/3 推送表结构..." -NoNewline
    Push-Location $API_DIR
    $env:DATABASE_URL = "postgres://postgres:postgres@localhost:5432/threecloud"
    npx drizzle-kit push --force 2>&1 | Out-Null
    Pop-Location
    Write-Host " ✅" -ForegroundColor Green
}

# ── 生成快照 ──
function Save-Snapshot {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $outFile = Join-Path $SNAPSHOT_DIR "threecloud-$timestamp.sql"

    Write-Host "📸 创建快照: $outFile" -ForegroundColor Cyan

    $env:PGPASSWORD = "postgres"
    $result = & $PGDUMP -U $DB_USER -d $DB_NAME --data-only --file $outFile 2>&1

    if ($LASTEXITCODE -eq 0) {
        $size = (Get-Item $outFile).Length
        Write-Host "✅ 快照已保存 ($([math]::Round($size / 1KB)) KB)" -ForegroundColor Green

        # 保留最近 10 个
        $snapshots = Get-ChildItem $SNAPSHOT_DIR -Filter "threecloud-*.sql" | Sort-Object LastWriteTime -Descending
        if ($snapshots.Count -gt 10) {
            foreach ($f in $snapshots[10..($snapshots.Count - 1)]) {
                Remove-Item $f.FullName
                Write-Host "  🗑️  删除旧快照: $($f.Name)" -ForegroundColor DarkYellow
            }
        }
    } else {
        Write-Host "❌ 快照失败: $result" -ForegroundColor Red
        exit 1
    }
}

# ── 恢复快照 ──
function Restore-Snapshot {
    $snapshots = Get-ChildItem $SNAPSHOT_DIR -Filter "threecloud-*.sql" | Sort-Object LastWriteTime -Descending
    if ($snapshots.Count -eq 0) {
        Write-Host "⚠️  没有可用的快照" -ForegroundColor Yellow
        return
    }

    $latest = $snapshots[0]
    Write-Host "⏪ 恢复快照: $($latest.Name)" -ForegroundColor Yellow
    Write-Host "   (时间: $($latest.LastWriteTime), 大小: $([math]::Round($latest.Length / 1KB)) KB)" -ForegroundColor Gray

    Invoke-DbRebuild

    Write-Host "  3/3 恢复数据..." -NoNewline
    $env:PGPASSWORD = "postgres"
    & $PSQL -U $DB_USER -d $DB_NAME -f $latest.FullName 2>&1 | Out-Null
    Write-Host " ✅" -ForegroundColor Green

    Write-Host "✅ 快照恢复完成" -ForegroundColor Green
}

# ── 列出现有快照 ──
function List-Snapshots {
    $snapshots = Get-ChildItem $SNAPSHOT_DIR -Filter "threecloud-*.sql" | Sort-Object LastWriteTime -Descending

    if ($snapshots.Count -eq 0) {
        Write-Host "📭 暂无快照" -ForegroundColor Yellow
        Write-Host "   使用 '.\dev-snapshot.ps1 save' 生成" -ForegroundColor Gray
        return
    }

    Write-Host "📦 快照列表:" -ForegroundColor Cyan
    $i = 0
    foreach ($f in $snapshots) {
        $dateStr = $f.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
        $sizeStr = if ($f.Length -gt 1MB) { "$([math]::Round($f.Length / 1MB, 1)) MB" }
                   else { "$([math]::Round($f.Length / 1KB)) KB" }
        $marker = if ($i -eq 0) { " ◀ 最近" } else { "" }
        Write-Host "  [$i] $($f.Name)  ($sizeStr)  $dateStr$marker" -ForegroundColor $(if ($i -eq 0) { "Green" } else { "White" })
        $i++
    }
    Write-Host ""
    Write-Host "  恢复: .\dev-snapshot.ps1 restore" -ForegroundColor Gray
}

# ── 重置数据库（从零） ──
function Reset-Database {
    Write-Host "`n⚠️  ⚠️  ⚠️  即将重置数据库 ⚠️  ⚠️  ⚠️" -ForegroundColor Red
    Write-Host "  数据库: $DB_NAME" -ForegroundColor Yellow
    Write-Host "  所有数据将被清空！" -ForegroundColor Red
    Write-Host ""
    $confirm = Read-Host "确认重置? (输入 YES 确认)"
    if ($confirm -ne "YES") { Write-Host "取消" -ForegroundColor Gray; return }

    Invoke-DbRebuild

    Write-Host "  3/3 插入基础种子..." -NoNewline
    Push-Location $API_DIR
    npx tsx src/db/seed.ts 2>&1 | Out-Null
    Pop-Location
    Write-Host " ✅" -ForegroundColor Green

    Write-Host "`n✅ 数据库已重置" -ForegroundColor Green
    Write-Host "  下一步: 运行数据工厂" -ForegroundColor Cyan
    Write-Host "  npx tsx src/scripts/data-factory.ts all  (cd api)" -ForegroundColor Gray
}

# ── 刷新（重置 + 数据工厂） ──
function Refresh-Database {
    Write-Host "`n🔄 全量刷新: 重置数据库 → 运行数据工厂" -ForegroundColor Cyan
    Write-Host "  数据库: $DB_NAME" -ForegroundColor Yellow
    Write-Host ""
    $confirm = Read-Host "确认? (输入 YES 确认)"
    if ($confirm -ne "YES") { Write-Host "取消" -ForegroundColor Gray; return }

    Invoke-DbRebuild

    Write-Host "  3/3 运行数据工厂（全部场景）..." -ForegroundColor Cyan
    Push-Location $API_DIR
    npx tsx src/scripts/data-factory.ts all
    Pop-Location

    Write-Host "`n✅ 数据库刷新完成" -ForegroundColor Green
    Write-Host "  提示: 现在可以保存快照" -ForegroundColor Cyan
    Write-Host "  .\dev-snapshot.ps1 save" -ForegroundColor Gray
}

# ── 帮助 ──
function Show-Help {
    Write-Host @"

  3cloud 开发数据库快照管理
  ═══════════════════════════════

  用法:
    .\dev-snapshot.ps1 save        生成快照 (保留最近 10 个)
    .\dev-snapshot.ps1 restore     恢复最近快照
    .\dev-snapshot.ps1 list        列出快照
    .\dev-snapshot.ps1 reset       重置数据库（从零 + seed）
    .\dev-snapshot.ps1 refresh     重置 → 运行数据工厂（一步到位）

  快照目录: $SNAPSHOT_DIR
  PostgreSQL: $PGBIN

"@ -ForegroundColor Cyan
}

# ── 入口 ──
switch ($Action) {
    "save"    { Save-Snapshot }
    "restore" { Restore-Snapshot }
    "list"    { List-Snapshots }
    "reset"   { Reset-Database }
    "refresh" { Refresh-Database }
    default   { Show-Help }
}
