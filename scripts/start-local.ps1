# 3cloud Local Dev Environment Startup Script
# - Checks each service; skips if already running
# - Idempotent: safe to run repeatedly
# - Memurai fallback: starts as process if not registered as service
# Usage: powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1
#        Or right-click -> Run with PowerShell

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$ApiDir     = Join-Path $ProjectRoot "api"
$WebDir     = Join-Path $ProjectRoot "web"
$LogDir     = Join-Path $ProjectRoot "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

function Write-Info  { Write-Host "[INFO] $args" -ForegroundColor Cyan }
function Write-OK   { Write-Host "[OK]   $args" -ForegroundColor Green }
function Write-Warn { Write-Host "[WARN] $args" -ForegroundColor Yellow }
function Write-Err  { Write-Host "[ERR]  $args" -ForegroundColor Red }

$ts = Get-Date -Format "yyyyMMdd-HHmmss"

# ============================================================
# Helper: Check if a TCP port is listening
# ============================================================
function Test-PortListening($Port) {
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction Stop |
            Where-Object { $_.State -eq "Listen" }
        return ($null -ne $conn)
    } catch {
        return $false
    }
}

# ============================================================
# Helper: Start a background process with logging
# ============================================================
function Start-BackgroundProcess($Name, $WorkDir, $Command, $LogFile) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "powershell.exe"
    $psi.Arguments = "-NoProfile -WindowStyle Hidden -Command `"cd '$WorkDir'; $Command *>&1 | Out-File -FilePath '$LogFile' -Encoding utf8 -Append`""
    $psi.UseShellExecute = $false
    $process = [System.Diagnostics.Process]::Start($psi)
    Write-Info "$Name started (PID: $($process.Id)), log: $LogFile"
    return $process
}

# ============================================================
# 1. PostgreSQL
# ============================================================
Write-Info "Checking PostgreSQL service..."
$pgSvc = Get-Service "postgresql*" -ErrorAction SilentlyContinue
if ($pgSvc -and $pgSvc.Status -eq "Running") {
    Write-OK "PostgreSQL ($($pgSvc.Name)) is already running"
} elseif ($pgSvc) {
    Write-Info "Starting PostgreSQL ($($pgSvc.Name))..."
    Start-Service $pgSvc.Name
    Start-Sleep -Seconds 3
    Write-OK "PostgreSQL started"
} else {
    Write-Warn "PostgreSQL service not found. Please ensure it is installed."
}

# ============================================================
# 2. Memurai / Redis
# ============================================================
Write-Info "Checking Memurai/Redis..."
$redisRunning = Test-PortListening 6379
$redisSvc = Get-Service "Memurai*", "Redis*" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($redisRunning) {
    Write-OK "Memurai/Redis is already running on port 6379"
} elseif ($redisSvc) {
    Write-Info "Starting Memurai/Redis service ($($redisSvc.Name))..."
    Start-Service $redisSvc.Name
    Start-Sleep -Seconds 2
    if (Test-PortListening 6379) {
        Write-OK "Memurai/Redis service started"
    } else {
        Write-Err "Memurai/Redis service failed to start"
    }
} else {
    # Memurai installed but not registered as service — start as process
    $memuraiExe = "C:\Program Files\Memurai\memurai.exe"
    if (Test-Path $memuraiExe) {
        Write-Info "Memurai is not registered as a service, starting as process..."
        # Kill any stale memurai process first
        Get-Process -Name "memurai" -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Sleep -Seconds 1
        Start-Process -FilePath $memuraiExe -WindowStyle Hidden
        $wait = 0
        while ($wait -lt 10) {
            Start-Sleep -Seconds 1
            $wait++
            if (Test-PortListening 6379) {
                Write-OK "Memurai started successfully on port 6379"
                break
            }
        }
        if (-not (Test-PortListening 6379)) {
            Write-Err "Memurai failed to start on port 6379"
        }
    } else {
        Write-Warn "Memurai/Redis not found at $memuraiExe"
    }
}

# ============================================================
# 3. API Backend (localhost:3000)
# ============================================================
Write-Info "Checking API backend (localhost:3000)..."
$apiReady = $false

if (Test-PortListening 3000) {
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:3000/health" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { $apiReady = $true }
    } catch {
        Write-Warn "Port 3000 is listening but health check failed. Service may be degraded."
    }
}

if ($apiReady) {
    Write-OK "API backend is already running (health: OK)"
} elseif (-not (Test-PortListening 3000)) {
    Write-Info "Starting API backend..."
    $apiLog = Join-Path $LogDir "api-$ts.log"
    Start-BackgroundProcess "API backend" $ApiDir "npm run dev" $apiLog

    Write-Info "Waiting for API backend to be ready..."
    $maxWait = 45
    $waited = 0
    $ready = $false
    while ($waited -lt $maxWait) {
        Start-Sleep -Seconds 2
        $waited += 2
        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:3000/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
            if ($resp.StatusCode -eq 200) { $ready = $true; break }
        } catch {
            # Check log for errors
            $lastLine = Get-Content $apiLog -Tail 1 -ErrorAction SilentlyContinue
            if ($lastLine -match "error|Error|fail") {
                Write-Warn "  Possible error: $($lastLine.Substring(0, [Math]::Min(80, $lastLine.Length)))"
            }
        }
        Write-Info "  Waiting... ($waited/$maxWait sec)"
    }
    if ($ready) {
        Write-OK "API backend is ready (localhost:3000)"
    } else {
        Write-Err "API backend startup timeout, check log: $apiLog"
    }
}

# ============================================================
# 4. Web Frontend (localhost:5175)
# ============================================================
Write-Info "Checking Web frontend (localhost:5175)..."
$webReady = $false

if (Test-PortListening 5175) {
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:5175" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { $webReady = $true }
    } catch {
        Write-Warn "Port 5175 is listening but HTTP check failed. Skipping auto-restart."
    }
}

if ($webReady) {
    Write-OK "Web frontend is already running (HTTP 200)"
} elseif (-not (Test-PortListening 5175)) {
    Write-Info "Starting Web frontend..."
    $webLog = Join-Path $LogDir "web-$ts.log"
    Start-BackgroundProcess "Web frontend" $WebDir "npm run dev" $webLog

    Write-Info "Waiting for Web frontend to be ready..."
    $maxWait = 30
    $waited = 0
    $ready = $false
    while ($waited -lt $maxWait) {
        Start-Sleep -Seconds 2
        $waited += 2
        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:5175" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
            if ($resp.StatusCode -eq 200) { $ready = $true; break }
        } catch {}
        Write-Info "  Waiting... ($waited/$maxWait sec)"
    }
    if ($ready) {
        Write-OK "Web frontend is ready (localhost:5175)"
    } else {
        Write-Err "Web frontend startup timeout, check log: $webLog"
    }
}

# ============================================================
# 5. Final Summary
# ============================================================
Write-Host ""
Write-Info "===== Service Status Summary ====="
$allOK = $true

try {
    $resp = Invoke-WebRequest -Uri "http://localhost:3000/health" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    $body = $resp.Content | ConvertFrom-Json
    $uptime = if ($body.uptime) { [math]::Round($body.uptime / 60, 1).ToString() + " min" } else { "OK" }
    Write-OK "API Backend   http://localhost:3000   (uptime: $uptime)"
} catch {
    Write-Err "API Backend   http://localhost:3000   NOT AVAILABLE"
    $allOK = $false
}

try {
    $resp = Invoke-WebRequest -Uri "http://localhost:5175" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    Write-OK "Web Frontend  http://localhost:5175   (HTTP $($resp.StatusCode))"
} catch {
    Write-Err "Web Frontend  http://localhost:5175   NOT AVAILABLE"
    $allOK = $false
}

$pgSvc = Get-Service "postgresql*" -ErrorAction SilentlyContinue
if ($pgSvc -and $pgSvc.Status -eq "Running") {
    Write-OK "PostgreSQL    localhost:5432          Running"
} else {
    Write-Warn "PostgreSQL    localhost:5432          Status: $(if($pgSvc){$pgSvc.Status}else{'Not found'})"
}

if (Test-PortListening 6379) {
    Write-OK "Memurai/Redis localhost:6379          Running"
} else {
    Write-Warn "Memurai/Redis localhost:6379          Not running"
}

Write-Host ""
if ($allOK) {
    Write-OK "========================================"
    Write-OK "  All core services are ready!"
    Write-OK ""
    Write-OK "  Frontend : http://localhost:5175"
    Write-OK "  API      : http://localhost:3000"
    Write-OK "========================================"
} else {
    Write-Err "========================================"
    Write-Err "  Some services failed to start!"
    Write-Err "  Check logs in: $LogDir"
    Write-Err "========================================"
}
