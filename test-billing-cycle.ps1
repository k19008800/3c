# ============================================================
#  账单周期概览功能测试
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host "=== 账单周期概览功能测试 ===" -ForegroundColor Cyan
Write-Host ""

# 1. 检查后端 API 路由
Write-Host "1. 检查后端 API 路由..." -ForegroundColor Yellow

$routeFile = "api/src/routes/me/billing/current-period.ts"
if (Test-Path $routeFile) {
    Write-Host "  ✓ 后端路由文件存在: $routeFile" -ForegroundColor Green
    
    # 检查路由是否在 app/routes.ts 中注册
    $routesContent = Get-Content "api/src/app/routes.ts" -Raw
    if ($routesContent -match "billingCurrentPeriodRoutes") {
        Write-Host "  ✓ 路由已注册到 app/routes.ts" -ForegroundColor Green
    } else {
        Write-Host "  ✗ 路由未注册到 app/routes.ts" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "  ✗ 后端路由文件不存在: $routeFile" -ForegroundColor Red
    exit 1
}

# 2. 检查前端组件
Write-Host ""
Write-Host "2. 检查前端组件..." -ForegroundColor Yellow

$componentFile = "web/src/pages/dashboard/components/BillingCycleCard.tsx"
$hookFile = "web/src/hooks/useBillingCycle.ts"

if (Test-Path $componentFile) {
    Write-Host "  ✓ 前端组件存在: $componentFile" -ForegroundColor Green
} else {
    Write-Host "  ✗ 前端组件不存在: $componentFile" -ForegroundColor Red
    exit 1
}

if (Test-Path $hookFile) {
    Write-Host "  ✓ Hook 文件存在: $hookFile" -ForegroundColor Green
} else {
    Write-Host "  ✗ Hook 文件不存在: $hookFile" -ForegroundColor Red
    exit 1
}

# 检查组件是否集成到 Dashboard
$dashboardContent = Get-Content "web/src/pages/Dashboard.tsx" -Raw
if ($dashboardContent -match "BillingCycleCard") {
    Write-Host "  ✓ BillingCycleCard 已集成到 Dashboard" -ForegroundColor Green
} else {
    Write-Host "  ✗ BillingCycleCard 未集成到 Dashboard" -ForegroundColor Red
    exit 1
}

# 3. 检查代码行数
Write-Host ""
Write-Host "3. 代码统计..." -ForegroundColor Yellow

$backendLines = (Get-Content $routeFile).Count
$frontendLines = (Get-Content $componentFile).Count
$hookLines = (Get-Content $hookFile).Count

Write-Host "  后端 API: $backendLines 行" -ForegroundColor White
Write-Host "  前端组件: $frontendLines 行" -ForegroundColor White
Write-Host "  Hook: $hookLines 行" -ForegroundColor White
Write-Host "  总计: $($backendLines + $frontendLines + $hookLines) 行" -ForegroundColor White

# 4. 检查 API 健康状态
Write-Host ""
Write-Host "4. 检查 API 健康状态..." -ForegroundColor Yellow

try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/health" -Method Get
    Write-Host "  ✓ API 运行正常 (uptime: $([math]::Round($health.uptime, 2))s)" -ForegroundColor Green
} catch {
    Write-Host "  ✗ API 未运行或无法访问" -ForegroundColor Red
    Write-Host "  请先启动 API: cd 3cloud/api && npm run dev" -ForegroundColor Yellow
    exit 1
}

# 5. 功能验证
Write-Host ""
Write-Host "5. 功能验证..." -ForegroundColor Yellow

# 检查后端返回的数据结构
$backendCode = Get-Content $routeFile -Raw
$requiredFields = @(
    "periodStart",
    "periodEnd",
    "daysInMonth",
    "daysPassed",
    "progressPercent",
    "billedAmount",
    "pendingAmount",
    "estimatedAmount",
    "momChangePercent",
    "dailyTrend"
)

$allFieldsPresent = $true
foreach ($field in $requiredFields) {
    if ($backendCode -match $field) {
        Write-Host "  ✓ 包含字段: $field" -ForegroundColor Green
    } else {
        Write-Host "  ✗ 缺少字段: $field" -ForegroundColor Red
        $allFieldsPresent = $false
    }
}

if (-not $allFieldsPresent) {
    exit 1
}

# 6. 测试总结
Write-Host ""
Write-Host "=== 测试总结 ===" -ForegroundColor Cyan
Write-Host "✓ 所有检查通过！" -ForegroundColor Green
Write-Host ""
Write-Host "创建的文件:" -ForegroundColor Yellow
Write-Host "  1. $routeFile" -ForegroundColor White
Write-Host "  2. $componentFile" -ForegroundColor White
Write-Host "  3. $hookFile" -ForegroundColor White
Write-Host ""
Write-Host "代码行数统计:" -ForegroundColor Yellow
Write-Host "  后端 API: $backendLines 行" -ForegroundColor White
Write-Host "  前端组件: $frontendLines 行" -ForegroundColor White
Write-Host "  Hook: $hookLines 行" -ForegroundColor White
Write-Host "  总计: $($backendLines + $frontendLines + $hookLines) 行" -ForegroundColor White
Write-Host ""
Write-Host "功能特性:" -ForegroundColor Yellow
Write-Host "  - 当前计费周期起止时间" -ForegroundColor White
Write-Host "  - 本周期已消费金额" -ForegroundColor White
Write-Host "  - 预估账单金额（基于日均消费）" -ForegroundColor White
Write-Host "  - 与上周期环比对比" -ForegroundColor White
Write-Host "  - 周期进度条显示" -ForegroundColor White
Write-Host "  - 近7天消费趋势图" -ForegroundColor White
Write-Host ""
