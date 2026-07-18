#!/usr/bin/env pwsh
param(
  [Parameter(Mandatory=$true)][string]$Method,
  [Parameter(Mandatory=$true)][string]$Url,
  [string]$Body = $null
)

$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjUsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc4NDM3OTYwOCwiZXhwIjoxNzg0Mzg2ODA4fQ.6xZYa3x7so5nel7GMpeK7AfwwFrun8XZEHYWtd2GohI"
$headers = @{
  "Authorization" = "Bearer $token"
  "Content-Type" = "application/json"
}

if ($Body) {
  $tmp = [System.IO.Path]::GetTempFileName()
  Set-Content -Path $tmp -Value $Body -Encoding UTF8
  $result = curl.exe -s -X $Method $Url -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d "@$tmp"
  Remove-Item $tmp
} else {
  $result = curl.exe -s -X $Method $Url -H "Authorization: Bearer $token" -H "Content-Type: application/json"
}
$result | ConvertFrom-Json -Depth 10
