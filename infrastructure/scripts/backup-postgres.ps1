param(
  [string]$OutputPath = "",
  [string]$DatabaseUrl = $env:DATABASE_URL
)

$ErrorActionPreference = "Stop"
if (-not $DatabaseUrl) { throw "DATABASE_URL is required" }
if (-not $OutputPath) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutputPath = Join-Path (Join-Path $PSScriptRoot "..\..\backups") "solar-$stamp.sql"
}
New-Item -ItemType Directory -Force -Path (Split-Path $OutputPath) | Out-Null
& pg_dump --no-owner --format=plain --file=$OutputPath $DatabaseUrl
Write-Host "Wrote $OutputPath"
