$ApiKey = "sk-3c-ac788b0e98e0115e0b45f4b101ef439256f91b6ab5c059dc"
$Url = "http://localhost:3000/v1/chat/completions"
$Headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $ApiKey"
}

Write-Host "=== Verify 429 Response Body and Headers ==="
Write-Host ""

# Send 6 requests to trigger rate limit, then capture response details
for ($i = 1; $i -le 6; $i++) {
    $body = @{model="deepseek-chat"; messages=@(@{role="user"; content="hi"}); max_tokens=10} | ConvertTo-Json
    $start = Get-Date
    
    try {
        $response = Invoke-WebRequest -Uri $Url -Method POST -Headers $Headers -Body $body -UseBasicParsing
        # success - nothing special to capture
    } catch {
        $elapsed = [int]((Get-Date) - $start).TotalMilliseconds
        $statusCode = [int]$_.Exception.Response.StatusCode
        
        # Capture full response
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $responseText = $reader.ReadToEnd()
        
        Write-Host "Request $i : HTTP $statusCode"
        Write-Host "Headers:"
        $_.Exception.Response.Headers.Keys | ForEach-Object {
            Write-Host "  $_ : $($_.Exception.Response.Headers[$_])"
        }
        Write-Host "Body: $responseText"
        Write-Host ""
    }
}
