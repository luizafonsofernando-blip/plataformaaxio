# PREVIA por padrao; apenas -Apply cria/atualiza tarefa no Windows.
param(
    [ValidateNotNullOrEmpty()]
    [string[]]$Times = @('09:00', '15:00'),
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$worker = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runner = Join-Path $PSScriptRoot 'run-sync.ps1'
$account = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
if (-not (Test-Path $runner)) { throw "Nao encontrado: $runner" }
foreach ($time in $Times) {
    if ($time -notmatch '^([01]\d|2[0-3]):[0-5]\d$') { throw "Horario invalido: $time. Use HH:mm." }
}
$Times = @($Times | Select-Object -Unique)
Write-Host 'Conta Windows:' $account
Write-Host 'Dias: segunda a sexta; apenas quando este usuario estiver conectado.'
Write-Host 'Horarios:' ($Times -join ', ')
if (-not $Apply) {
    Write-Host 'MODO PREVIA. Nenhuma tarefa criada.' -ForegroundColor Yellow
    Write-Host 'Apos homologar: .\windows\register-task.ps1 -Times 09:00,15:00 -Apply'
    exit 0
}
if (-not (Test-Path (Join-Path $worker '.env'))) { throw 'Configure o .env antes de agendar.' }
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $runner + '"') -WorkingDirectory $worker
$triggers = @()
foreach ($time in $Times) {
    $parts = $time.Split(':')
    $at = (Get-Date).Date.AddHours([int]$parts[0]).AddMinutes([int]$parts[1])
    $triggers += New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At $at
}
$principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -StartWhenAvailable:$false -WakeToRun:$false
$name = 'Luce E-BEF - Gestta leitura'
Register-ScheduledTask -TaskName $name -Action $action -Trigger $triggers -Principal $principal -Settings $settings -Description 'Somente exportacao/leitura no Gestta; sincronizacao na Luce.' -Force | Out-Null
Write-Host "Tarefa '$name' criada/atualizada." -ForegroundColor Green
Write-Host 'Para desativar: Disable-ScheduledTask -TaskName "Luce E-BEF - Gestta leitura"'