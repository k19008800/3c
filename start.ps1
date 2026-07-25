# 3cloud 一键启动
# Usage: .\start.ps1
#        (right-click -> Run with PowerShell, or from terminal)

$scriptPath = Join-Path $PSScriptRoot "scripts" "start-local.ps1"
if (Test-Path $scriptPath) {
    & $scriptPath
} else {
    Write-Host "[ERR] 启动脚本未找到: $scriptPath" -ForegroundColor Red
    exit 1
}
