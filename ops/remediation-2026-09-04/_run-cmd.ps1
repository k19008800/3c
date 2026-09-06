param(
    [Parameter(Mandatory=$true)][string]$Name,
    [Parameter(Mandatory=$true)][string]$WorkDir,
    [Parameter(Mandatory=$true)][string]$OutDir,
    [Parameter(Mandatory=$true)][string]$Command
)
# Run a command, capture start/end time, exit code, full output, and write a summary line.
$start = Get-Date
$outFile = Join-Path $OutDir ("{0}.log" -f ($Name -replace '[^A-Za-z0-9_-]', '_'))
$exit = 0
$output = ""
try {
    $output = & cmd /c $Command 2>&1 | Out-String
    $exit = $LASTEXITCODE
} catch {
    $exit = 1
    $output = "EXCEPTION: $_`n$($_.ScriptStackTrace)"
}
$end = Get-Date
$durationMs = [math]::Round(($end - $start).TotalMilliseconds)
$summary = "START=$($start.ToString('yyyy-MM-dd HH:mm:ss.fff'))`nEND=$($end.ToString('yyyy-MM-dd HH:mm:ss.fff'))`nDURATION_MS=$durationMs`nEXIT_CODE=$exit`nCOMMAND=$Command"
@($summary, "", "========== FULL OUTPUT ==========", "", $output) | Out-File -FilePath $outFile -Encoding utf8
$summaryLine = "$Name`tSTART=$($start.ToString('HH:mm:ss'))`tEND=$($end.ToString('HH:mm:ss'))`tMS=$durationMs`tEXIT=$exit"
$summaryLine
Write-Output ("LOGDIR=" + $OutDir)
$output | Select-Object -First 30