# 验证成本预测功能实现

Write-Host "=== 验证成本预测功能实现 ===" -ForegroundColor Cyan
Write-Host ""

# 检查后端文件
Write-Host "1. 检查后端文件..." -ForegroundColor Yellow
$backendFiles = @(
    "3cloud/api/src/routes/me/stats/forecast.ts",
    "3cloud/api/src/routes/me/stats/__tests__/forecast.test.ts"
)

foreach ($file in $backendFiles) {
    if (Test-Path $file) {
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file (缺失)" -ForegroundColor Red
    }
}

# 检查前端文件
Write-Host ""
Write-Host "2. 检查前端文件..." -ForegroundColor Yellow
$frontendFiles = @(
    "3cloud/web/src/hooks/useCostForecast.ts",
    "3cloud/web/src/hooks/__tests__/useCostForecast.test.ts",
    "3cloud/web/src/pages/dashboard/components/CostForecastCard.tsx",
    "3cloud/web/src/pages/dashboard/components/__tests__/CostForecastCard.test.tsx"
)

foreach ($file in $frontendFiles) {
    if (Test-Path $file) {
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file (缺失)" -ForegroundColor Red
    }
}

# 检查路由注册
Write-Host ""
Write-Host "3. 检查路由注册..." -ForegroundColor Yellow
$routesContent = Get-Content "3cloud/api/src/app/routes.ts" -Raw
if ($routesContent -match "meStatsForecastRoutes") {
    Write-Host "  ✓ 后端路由已注册" -ForegroundColor Green
} else {
    Write-Host "  ✗ 后端路由未注册" -ForegroundColor Red
}

# 检查组件集成
Write-Host ""
Write-Host "4. 检查组件集成..." -ForegroundColor Yellow
$dashboardContent = Get-Content "3cloud/web/src/pages/Dashboard.tsx" -Raw
if ($dashboardContent -match "CostForecastCard") {
    Write-Host "  ✓ 前端组件已集成" -ForegroundColor Green
} else {
    Write-Host "  ✗ 前端组件未集成" -ForegroundColor Red
}

# 统计代码行数
Write-Host ""
Write-Host "5. 代码统计..." -ForegroundColor Yellow
$apiLines = (Get-Content "3cloud/api/src/routes/me/stats/forecast.ts").Count
$hookLines = (Get-Content "3cloud/web/src/hooks/useCostForecast.ts").Count
$cardLines = (Get-Content "3cloud/web/src/pages/dashboard/components/CostForecastCard.tsx").Count
$totalLines = $apiLines + $hookLines + $cardLines

Write-Host "  API 实现: $apiLines 行" -ForegroundColor Cyan
Write-Host "  Hook 实现: $hookLines 行" -ForegroundColor Cyan
Write-Host "  组件实现: $cardLines 行" -ForegroundColor Cyan
Write-Host "  总计: $totalLines 行" -ForegroundColor Cyan

Write-Host ""
Write-Host "=== 验证完成 ===" -ForegroundColor Cyan
