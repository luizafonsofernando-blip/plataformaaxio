$ErrorActionPreference = 'Stop'
$lines = @(pnpm dlx supabase status --workdir $PSScriptRoot -o env)
if ($LASTEXITCODE -ne 0) { throw 'Inicie o Supabase local antes de executar o servidor RTC.' }
$values = @{}
foreach ($line in $lines) {
  if ($line -match '^([A-Z_]+)=(.*)$') { $values[$Matches[1]] = $Matches[2] }
}
if ($values['API_URL'] -ne 'http://127.0.0.1:55321') { throw 'A URL do Supabase não é a instância RTC local esperada.' }
$publishable = if ($values['PUBLISHABLE_KEY']) { $values['PUBLISHABLE_KEY'] } else { $values['ANON_KEY'] }
$service = if ($values['SERVICE_ROLE_KEY']) { $values['SERVICE_ROLE_KEY'] } else { $values['SECRET_KEY'] }
if (-not $publishable -or -not $service) { throw 'Chaves locais ausentes.' }
$env:SUPABASE_URL = $values['API_URL']
$env:SUPABASE_PUBLISHABLE_KEY = $publishable
$env:SUPABASE_ANON_KEY = $values['ANON_KEY']
$env:SUPABASE_SERVICE_ROLE_KEY = $service
$env:RTC_LOCAL_MODE = '1'
$env:NODE_ENV = 'development'
if ($env:RTC_GATEWAY_TOKEN) {
  $env:RTC_LOCAL_ENGINE_HTTP = '1'
  $env:RTC_REGULAR_ENGINE_URL = 'http://127.0.0.1:58080/'
  $env:RTC_SIMPLES_ENGINE_URL = 'http://127.0.0.1:58080/'
  $env:RTC_REGULAR_ENGINE_TOKEN = $env:RTC_GATEWAY_TOKEN
  $env:RTC_SIMPLES_ENGINE_TOKEN = $env:RTC_GATEWAY_TOKEN
}
$server = Join-Path $PSScriptRoot 'dev-server.mjs'
node $server
