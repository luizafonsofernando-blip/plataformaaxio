$ErrorActionPreference = 'Stop'
$lines = @(pnpm dlx supabase status --workdir $PSScriptRoot -o env)
if ($LASTEXITCODE -ne 0) { throw 'Inicie o Supabase RTC local antes de criar o usuário de teste.' }
$values = @{}
foreach ($line in $lines) {
  if ($line -match '^([A-Z_]+)=(.*)$') { $values[$Matches[1]] = $Matches[2] }
}
if ($values['API_URL'] -ne 'http://127.0.0.1:55321') { throw 'A URL não é o Supabase RTC local.' }
$service = if ($values['SERVICE_ROLE_KEY']) { $values['SERVICE_ROLE_KEY'] } else { $values['SECRET_KEY'] }
if (-not $service) { throw 'Chave local de administração ausente.' }
$email = (Read-Host 'E-mail de teste local').Trim()
if ($email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') { throw 'E-mail inválido.' }
$securePassword = Read-Host 'Senha de teste local' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
if ($password.Length -lt 8) { throw 'Use pelo menos oito caracteres.' }
$body = @{
  email = $email
  password = $password
  email_confirm = $true
  app_metadata = @{ role = 'admin'; status = 'approved'; allowed_modules = @('reforma-tributaria') }
  user_metadata = @{ display_name = 'Administrador RTC local' }
} | ConvertTo-Json -Depth 4
$password = $null
$created = Invoke-RestMethod -Method Post -Uri "$($values['API_URL'])/auth/v1/admin/users" -Headers @{
  apikey = $service
  authorization = "Bearer $service"
} -ContentType 'application/json' -Body $body
$env:RTC_BOOTSTRAP_ADMIN_USER_ID = $created.id
Write-Output "Usuário RTC local criado: $($created.id). A variável RTC_BOOTSTRAP_ADMIN_USER_ID foi definida neste terminal."
