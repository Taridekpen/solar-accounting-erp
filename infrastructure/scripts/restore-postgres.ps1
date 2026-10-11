param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [string]$DatabaseUrl = $env:DATABASE_URL
)

$ErrorActionPreference = "Stop"
if (-not $DatabaseUrl) { throw "DATABASE_URL is required" }
if (-not (Test-Path $InputPath)) { throw "Dump file not found: $InputPath" }
& psql $DatabaseUrl -v ON_ERROR_STOP=1 -f $InputPath
Write-Host "Restored $InputPath into $DatabaseUrl"
