# Executa o worker autorizado; nao altera tarefas no Gestta.
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
$worker = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$logs = Join-Path $worker 'logs'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$log = Join-Path $logs ('sync-' + (Get-Date -Format 'yyyyMMdd') + '.log')
$mutex = New-Object System.Threading.Mutex($false, 'Local\LuceGesttaEbefSync')
$locked = $false
function Add-Log([string]$line) {
    ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $line) |
        Out-File -FilePath $log -Encoding utf8 -Append
}
try {
    $locked = $mutex.WaitOne(0)
    if (-not $locked) { Add-Log 'Ignorado: outra sincronizacao em andamento.'; exit 0 }
    if (-not (Test-Path (Join-Path $worker '.env'))) { throw 'Arquivo .env ausente.' }
    if (-not (Test-Path (Join-Path $worker 'node_modules'))) { throw 'Execute windows\setup.ps1 primeiro.' }
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    Add-Log ('Iniciando ' + $(if ($DryRun) { 'SIMULACAO' } else { 'SINCRONIZACAO REAL' }))
    Push-Location $worker
    try {
        $args = @((Join-Path $worker 'src\cli.mjs'), 'sync', '--backfill', '--auto', '--recent=2')
        if ($DryRun) { $args += '--dry-run' }
        $messages = & $node @args 2>&1
        $code = $LASTEXITCODE
        foreach ($message in $messages) { Add-Log ([string]$message) }
        if ($code -ne 0) { throw "Worker finalizou com codigo $code." }
        Add-Log 'Rotina finalizada com sucesso.'
    } finally { Pop-Location }
    Get-ChildItem -Path $logs -Filter 'sync-*.log' -File |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
        Remove-Item -Force
} catch {
    Add-Log ('ERRO: ' + $_.Exception.Message)
    Write-Error "Sincronizacao falhou. Consulte o log local em $log"
    exit 1
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}