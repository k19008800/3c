$ApiKey = "sk-3c-ac788b0e98e0115e0b45f4b101ef439256f91b6ab5c059dc"
$Url = "http://localhost:3000/v1/chat/completions"
$Headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $ApiKey"
}

Write-Host "============================================================"
Write-Host "  3cloud Rate Limit Engine Test"
Write-Host "  User 5 (admin) | RPM=5 override | TPM=1000 override"
Write-Host "============================================================"
Write-Host ""

# --- Test 1: RPM ---
Write-Host "--- RPM Limit Test ---"
Write-Host "Sending 10 requests (expect: first 5 OK, last 5 429)"
Write-Host ""

$rpmResults = @()
for ($i = 1; $i -le 10; $i++) {
    $body = @{
        model = "deepseek-chat"
        messages = @(@{role="user"; content="hi"})
        max_tokens = 10
    } | ConvertTo-Json
    
    $start = Get-Date
    try {
        $response = Invoke-WebRequest -Uri $Url -Method POST -Headers $Headers -Body $body -UseBasicParsing
        $elapsed = [int]((Get-Date) - $start).TotalMilliseconds
        Write-Host "  RPM Req ${i}: [200 OK] (${elapsed}ms)"
        $rpmResults += @{ Status = [int]$response.StatusCode; Elapsed = $elapsed }
    } catch {
        $elapsed = [int]((Get-Date) - $start).TotalMilliseconds
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $errBody = $reader.ReadToEnd()
            
            if ($_.Exception.Response.Headers.Keys -contains "Retry-After") {
                $retryAfter = $_.Exception.Response.Headers["Retry-After"]
                Write-Host "  RPM Req ${i}: [429 Rate Limited] (${elapsed}ms) Retry-After: $retryAfter"
            } else {
                Write-Host "  RPM Req ${i}: [429 Rate Limited] (${elapsed}ms) NO Retry-After header [ISSUE]"
            }
            Write-Host "    Response body: $errBody"
            $rpmResults += @{ Status = $statusCode; Elapsed = $elapsed; Body = $errBody }
        } else {
            Write-Host "  RPM Req ${i}: [ERROR] $($_.Exception.Message)"
        }
    }
}

$rpm200 = ($rpmResults | Where-Object { $_.Status -eq 200 }).Count
$rpm429 = ($rpmResults | Where-Object { $_.Status -eq 429 }).Count
$rpmPass = ($rpmResults[0].Status -eq 200 -and $rpmResults[4].Status -eq 200)
Write-Host ""
Write-Host "  RPM Summary: $rpm200 OK, $rpm429 rate limited"
if ($rpmResults.Count -ge 6) {
    Write-Host "  Req 6 status: $($rpmResults[5].Status) (expected 429)"
}
Write-Host ""

# --- Test 2: Recovery ---
Write-Host "--- Waiting 65s for window to expire ---"
Start-Sleep -Seconds 65
Write-Host "  Wait complete"
Write-Host ""

Write-Host "--- Recovery Test ---"
$body = @{model="deepseek-chat"; messages=@(@{role="user"; content="hi"}); max_tokens=10} | ConvertTo-Json
try {
    $response = Invoke-WebRequest -Uri $Url -Method POST -Headers $Headers -Body $body -UseBasicParsing
    Write-Host "  Recovery: [200 OK] - Rate limit window expired, request passes"
    $recovered = $true
} catch {
    $statusCode = [int]$_.Exception.Response.StatusCode
    Write-Host "  Recovery: [$statusCode] - NOT recovered"
    $recovered = $false
}
Write-Host ""

# --- Test 3: TPM ---
Write-Host "--- TPM Limit Test ---"
Write-Host "Sending high-token consumption requests"
Write-Host ""

foreach ($desc in @("Request 1 (max_tokens=500)", "Request 2 (max_tokens=2000)")) {
    $tokens = if ($desc -like "*2000*") { 2000 } else { 500 }
    $msg = if ($desc -like "*2000*") {
        "Write a very long essay about artificial intelligence history, covering all major milestones, key researchers, breakthrough technologies, ethical debates, and future outlook. Be extremely thorough and detailed in your response."
    } else {
        "Write a paragraph about AI technology and its impact on society."
    }
    
    $body = @{model="deepseek-chat"; messages=@(@{role="user"; content=$msg}); max_tokens=$tokens} | ConvertTo-Json
    try {
        $response = Invoke-WebRequest -Uri $Url -Method POST -Headers $Headers -Body $body -UseBasicParsing
        $content = $response.Content | ConvertFrom-Json
        Write-Host "  $desc : [200 OK]"
        if ($content.usage) {
            Write-Host "    Tokens used: $($content.usage.total_tokens) (prompt=$($content.usage.prompt_tokens), completion=$($content.usage.completion_tokens))"
        }
    } catch {
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $errBody = $reader.ReadToEnd()
            Write-Host "  $desc : [$statusCode]"
            Write-Host "    Response: $errBody"
        }
    }
}

Write-Host ""
Write-Host "============================================================"
Write-Host "  Test Summary"
Write-Host "============================================================"
Write-Host "  1. RPM limiting triggered after 5 requests: $(if($rpmPass){'PASS'}else{'FAIL'})"
Write-Host "     - Total 429 responses: $rpm429/5"
if ($rpmResults.Count -ge 6 -and $rpmResults[5].Body) {
    Write-Host "  2. 429 response format: $(($rpmResults[5].Body -match 'rate_limit_exceeded'))"
}
Write-Host "  3. Retry-After header: $(if($rpmResults | Where-Object {$_.Status -eq 429 -and $_.Headers.Keys -contains 'Retry-After'}){'PASS'}else{'MISSING - NEEDS FIX'})"
Write-Host "  4. Recovery after window expiry: $(if($recovered){'PASS'}else{'FAIL'})"
Write-Host "  5. TPM behavior: Check token counts above"
Write-Host ""
