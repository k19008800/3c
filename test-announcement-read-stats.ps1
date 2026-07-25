# ============================================================
#  测试公告阅读统计功能
# ============================================================

$baseUrl = "http://localhost:3000"
$adminToken = $null

Write-Host "`n=== 测试公告阅读统计功能 ===`n" -ForegroundColor Cyan

# 1. 登录获取管理员 token
Write-Host "1. 登录管理员账号..." -ForegroundColor Yellow
try {
    $loginBody = @{
        email = "admin@3c.com"
        password = "admin123"
    } | ConvertTo-Json

    $loginRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $adminToken = $loginRes.data.token
    Write-Host "   ✓ 登录成功" -ForegroundColor Green
} catch {
    Write-Host "   ✗ 登录失败: $_" -ForegroundColor Red
    exit 1
}

# 2. 获取公告列表
Write-Host "`n2. 获取公告列表..." -ForegroundColor Yellow
try {
    $headers = @{ Authorization = "Bearer $adminToken" }
    $listRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/announcements?page=1&pageSize=5" -Method Get -Headers $headers
    $announcements = $listRes.data.list
    Write-Host "   ✓ 获取到 $($announcements.Count) 条公告" -ForegroundColor Green
    
    if ($announcements.Count -eq 0) {
        Write-Host "   ! 没有公告，请先创建公告" -ForegroundColor Yellow
        exit 0
    }
} catch {
    Write-Host "   ✗ 获取公告列表失败: $_" -ForegroundColor Red
    exit 1
}

# 3. 测试阅读统计 API
$testAnnouncement = $announcements | Where-Object { $_.isPublished -eq $true } | Select-Object -First 1
if (-not $testAnnouncement) {
    $testAnnouncement = $announcements[0]
}

Write-Host "`n3. 测试阅读统计 API (公告 ID: $($testAnnouncement.id))..." -ForegroundColor Yellow
try {
    $statsRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/announcements/$($testAnnouncement.id)/stats" -Method Get -Headers $headers
    Write-Host "   ✓ 阅读统计获取成功" -ForegroundColor Green
    Write-Host "   - 总用户数: $($statsRes.data.totalUsers)" -ForegroundColor Cyan
    Write-Host "   - 已读用户: $($statsRes.data.readUsers)" -ForegroundColor Cyan
    Write-Host "   - 未读用户: $($statsRes.data.unreadUsers)" -ForegroundColor Cyan
    Write-Host "   - 阅读率: $($statsRes.data.readRate)%" -ForegroundColor Cyan
} catch {
    Write-Host "   ✗ 阅读统计获取失败: $_" -ForegroundColor Red
    Write-Host "   响应内容: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# 4. 测试阅读用户列表 API
Write-Host "`n4. 测试阅读用户列表 API..." -ForegroundColor Yellow
try {
    $readersRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/announcements/$($testAnnouncement.id)/readers?page=1&pageSize=10" -Method Get -Headers $headers
    Write-Host "   ✓ 阅读用户列表获取成功" -ForegroundColor Green
    Write-Host "   - 总用户数: $($readersRes.data.total)" -ForegroundColor Cyan
    Write-Host "   - 当前页用户数: $($readersRes.data.list.Count)" -ForegroundColor Cyan
    
    if ($readersRes.data.list.Count -gt 0) {
        $sampleUser = $readersRes.data.list[0]
        Write-Host "   - 示例用户: $($sampleUser.email) ($(@{ $true='已读'; $false='未读' }[$sampleUser.isRead]))" -ForegroundColor Cyan
    }
} catch {
    Write-Host "   ✗ 阅读用户列表获取失败: $_" -ForegroundColor Red
    Write-Host "   响应内容: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# 5. 测试筛选已读用户
Write-Host "`n5. 测试筛选已读用户..." -ForegroundColor Yellow
try {
    $readRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/announcements/$($testAnnouncement.id)/readers?readStatus=read&page=1&pageSize=10" -Method Get -Headers $headers
    Write-Host "   ✓ 已读用户列表获取成功" -ForegroundColor Green
    Write-Host "   - 已读用户数: $($readRes.data.total)" -ForegroundColor Cyan
} catch {
    Write-Host "   ✗ 已读用户列表获取失败: $_" -ForegroundColor Red
}

# 6. 测试筛选未读用户
Write-Host "`n6. 测试筛选未读用户..." -ForegroundColor Yellow
try {
    $unreadRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/announcements/$($testAnnouncement.id)/readers?readStatus=unread&page=1&pageSize=10" -Method Get -Headers $headers
    Write-Host "   ✓ 未读用户列表获取成功" -ForegroundColor Green
    Write-Host "   - 未读用户数: $($unreadRes.data.total)" -ForegroundColor Cyan
} catch {
    Write-Host "   ✗ 未读用户列表获取失败: $_" -ForegroundColor Red
}

Write-Host "`n=== 测试完成 ===`n" -ForegroundColor Green
