$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$target = Join-Path $PSScriptRoot 'supabase\migrations'
$linked = Join-Path $PSScriptRoot 'supabase\.temp\project-ref'
if (Test-Path -LiteralPath $linked) {
  throw 'O projeto local está vinculado a um projeto remoto. Remova o vínculo antes de preparar as migrations RTC.'
}
$names = @(
  '20261118001814_create_luce_rtc_foundation.sql',
  '20261118003754_create_luce_rtc_reports.sql'
)
foreach ($name in $names) {
  $source = Join-Path $root "supabase\migrations\$name"
  if (-not (Test-Path -LiteralPath $source)) { throw "Migration RTC ausente: $name" }
  Copy-Item -LiteralPath $source -Destination (Join-Path $target $name) -Force
}
Write-Output 'Somente as migrations RTC foram preparadas para o Supabase local.'
