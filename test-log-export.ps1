# ============================================================
#  3cloud (3C) — 日志导出功能测试脚本
# ============================================================

$baseUrl = "http://localhost:3000"
$tokenFile = ".test-token.txt"

Write-Host "=== 日志导出功能测试 ===" -ForegroundColor Cyan

# 1. 检查服务是否运行
Write-Host "`n[1/4] 检查服务状态..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get -TimeoutSec 5
    Write-Host "✓ 服务运行正常: $($health.status)" -ForegroundColor Green
} catch {
    Write-Host "✗ 服务未运行，请先启动 API 服务" -ForegroundColor Red
    Write-Host "  启动命令: cd 3cloud/api && npm run dev" -ForegroundColor Gray
    exit 1
}

# 2. 获取测试 Token
Write-Host "`n[2/4] 获取测试 Token..." -ForegroundColor Yellow
if (Test-Path $tokenFile) {
    $token = Get-Content $tokenFile
    Write-Host "✓ 使用已保存的 Token" -ForegroundColor Green
} else {
    Write-Host "请输入测试用户 Token (或按 Enter 跳过): " -NoNewline
    $token = Read-Host
    if ($token) {
        $token | Out-File $tokenFile
        Write-Host "✓ Token 已保存" -ForegroundColor Green
    } else {
        Write-Host "✗ 跳过 Token 输入，将无法测试导出功能" -ForegroundColor Yellow
    }
}

if (-not $token) {
    Write-Host "`n跳过 API 测试，仅验证代码结构" -ForegroundColor Yellow
    exit 0
}

# 3. 测试 CSV 导出
Write-Host "`n[3/4] 测试 CSV 导出..." -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $token"
    }
    
    # 导出最近 7 天的 CSV
    $startDate = (Get-Date).AddDays(-7).ToString("yyyy-MM-dd")
    $endDate = (Get-Date).ToString("yyyy-MM-dd")
    
    $response = Invoke-WebRequest `
        -Uri "$baseUrl/api/v1/logs/export?format=csv&startDate=$startDate&endDate=$endDate" `
        -Headers $headers `
        -Method Get `
        -TimeoutSec 30
    
    $contentType = $response.Headers["Content-Type"]
    $disposition = $response.Headers["Content-Disposition"]
    
    if ($contentType -like "*text/csv*") {
        Write-Host "✓ CSV 导出成功" -ForegroundColor Green
        Write-Host "  Content-Type: $contentType" -ForegroundColor Gray
        Write-Host "  Content-Disposition: $disposition" -ForegroundColor Gray
        
        # 保存测试文件
        $csvFile = "test-export-$(Get-Date -Format 'HHmmss').csv"
        $response.Content | Out-File -FilePath $csvFile -Encoding UTF8
        Write-Host "  已保存测试文件: $csvFile" -ForegroundColor Gray
        
        # 显示前几行
        $lines = $response.Content -split "`r`n" | Select-Object -First 5
        Write-Host "`n  CSV 内容预览:" -ForegroundColor Cyan
        $lines | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
    } else {
        Write-Host "✗ 返回的不是 CSV 格式: $contentType" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ CSV 导出失败: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. 测试 JSON 导出
Write-Host "`n[4/4] 测试 JSON 导出..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest `
        -Uri "$baseUrl/api/v1/logs/export?format=json&startDate=$startDate&endDate=$endDate" `
        -Headers $headers `
        -Method Get `
        -TimeoutSec 30
    
    $contentType = $response.Headers["Content-Type"]
    $disposition = $response.Headers["Content-Disposition"]
    
    if ($contentType -like "*application/json*") {
        Write-Host "✓ JSON 导出成功" -ForegroundColor Green
        Write-Host "  Content-Type: $contentType" -ForegroundColor Gray
        Write-Host "  Content-Disposition: $disposition" -ForegroundColor Gray
        
        # 保存测试文件
        $jsonFile = "test-export-$(Get-Date -Format 'HHmmss').json"
        $response.Content | Out-File -FilePath $jsonFile -Encoding UTF8
        Write-Host "  已保存测试文件: $jsonFile" -ForegroundColor Gray
        
        # 解析并显示统计
        $data = $response.Content | ConvertFrom-Json
        Write-Host "`n  JSON 数据统计:" -ForegroundColor Cyan
        Write-Host "    总记录数: $($data.Count)" -ForegroundColor Gray
        
        if ($data.Count -gt 0) {
            $first = $data[0]
            Write-Host "    字段: timestamp, model, status, inputTokens, outputTokens, totalTokens, cost, latencyMs, keyName" -ForegroundColor Gray
            Write-Host "    示例: $($first.model) - $($first.status) - ¥$($first.cost)" -ForegroundColor Gray
        }
    } else {
        Write-Host "✗ 返回的不是 JSON 格式: $contentType" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ JSON 导出失败: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== 测试完成 ===" -ForegroundColor Cyan
Write-Host "生成的测试文件:" -ForegroundColor Yellow
Get-ChildItem "test-export-*" | ForEach-Object {
    Write-Host "  $($_.Name) - $([math]::Round($_.Length / 1KB, 2)) KB" -ForegroundColor Gray
}
