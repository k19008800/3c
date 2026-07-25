# Test Model Optimization API
# This script tests the new optimization endpoint

Write-Host "Testing Model Optimization API..." -ForegroundColor Cyan

# 1. Login first
Write-Host "`n1. Logging in..." -ForegroundColor Yellow
$loginBody = @{
    email = "test@example.com"
    password = "test123456"
} | ConvertTo-Json

try {
    $loginRes = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/auth/login" `
        -Method Post `
        -Body $loginBody `
        -ContentType "application/json" `
        -SessionVariable session
    
    Write-Host "✓ Login successful" -ForegroundColor Green
} catch {
    Write-Host "✗ Login failed: $_" -ForegroundColor Red
    Write-Host "Note: You need a valid test account or adjust credentials" -ForegroundColor Yellow
    exit 1
}

# 2. Get optimization recommendations
Write-Host "`n2. Fetching optimization recommendations..." -ForegroundColor Yellow
try {
    $optRes = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/me/stats/optimization" `
        -Method Get `
        -WebSession $session
    
    Write-Host "✓ Optimization API responded" -ForegroundColor Green
    Write-Host "`nResponse:" -ForegroundColor Cyan
    $optRes | ConvertTo-Json -Depth 5
} catch {
    Write-Host "✗ Failed to fetch optimizations: $_" -ForegroundColor Red
    Write-Host "Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

Write-Host "`n✓ Test complete" -ForegroundColor Green
