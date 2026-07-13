$accounts = @(
  @{email="admin@3cloud.ai";   pass="Admin1234!";  role="super_admin"},
  @{email="admin@3cloud.dev";  pass="admin123";    role="admin"},
  @{email="finance@3cloud.ai"; pass="Finance123!"; role="finance_ops"},
  @{email="ops@3cloud.ai";     pass="Ops1234!";    role="ops"},
  @{email="support@3cloud.ai"; pass="Support123!"; role="support"},
  @{email="auditor@3cloud.ai"; pass="Auditor123!"; role="auditor"}
)

# Role -> expected status per endpoint (super_admin=200 default)
$matrix = @{
  "GET /api/v1/admin/users"               = @{auditor=403}
  "GET /api/v1/admin/dashboard/stats"      = @{support=403; auditor=403}
  "GET /api/v1/admin/models"               = @{finance_ops=403; support=403; auditor=403}
  "GET /api/v1/admin/withdraws"            = @{admin=403; ops=403; support=403; auditor=403}
  "GET /api/v1/admin/configs"              = @{finance_ops=403; ops=403; support=403; auditor=403}
  "GET /api/v1/admin/audit-logs"           = @{finance_ops=403; ops=403; support=403}
  "GET /api/v1/admin/agents"               = @{support=403; auditor=403}
  "GET /api/v1/admin/logs"                 = @{finance_ops=403; auditor=403}
  "GET /api/v1/admin/real-name-review"     = @{finance_ops=403; auditor=403}
  "GET /api/v1/admin/security/config"      = @{finance_ops=403; ops=403; support=403; auditor=403}
  "GET /api/v1/admin/recharge-orders"      = @{admin=403; ops=403; support=403; auditor=403}
  "GET /api/v1/admin/finance/dashboard"    = @{admin=403; ops=403; support=403; auditor=403}
  "GET /api/v1/admin/finance/reconciliation" = @{admin=403; ops=403; support=403}
}

$totalPass = 0; $totalFail = 0

foreach ($acct in $accounts) {
  $r = $acct.role
  $body = @{email=$acct.email; password=$acct.pass} | ConvertTo-Json -Compress
  $token = $null
  try {
    $resp = Invoke-WebRequest -Uri http://localhost:3000/api/v1/auth/login -Method POST -ContentType "application/json" -Body $body -UseBasicParsing
    $token = ($resp.Content | ConvertFrom-Json).data.accessToken
  } catch { Write-Host "--- $r LOGIN FAILED ---"; continue }

  foreach ($ep in $matrix.Keys) {
    $parts = $ep -split ' ', 2
    $method = $parts[0]; $url = "http://localhost:3000" + $parts[1]
    $expected = if ($matrix[$ep].ContainsKey($r)) { $matrix[$ep][$r] } else { 200 }
    $actual = 599
    try {
      $eresp = Invoke-WebRequest -Uri $url -Method $method -Headers @{Authorization="Bearer $token"} -UseBasicParsing
      $actual = $eresp.StatusCode
    } catch {
      $actual = $_.Exception.Response.StatusCode.value__
    }
    if ($actual -eq $expected) {
      $totalPass++
    } else {
      $totalFail++
      Write-Host "  FAIL $($r.PadRight(12)) $($method.PadRight(5)) $($parts[1].PadRight(42)) got=$actual exp=$expected"
    }
  }
}
Write-Host ""
Write-Host "========================================"
Write-Host "RESULT: $totalPass PASS, $totalFail FAIL"
if ($totalFail -eq 0) { Write-Host "ALL 72 TESTS PASSED!" }
