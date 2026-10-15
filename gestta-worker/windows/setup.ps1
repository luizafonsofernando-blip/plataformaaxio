# Instala dependencias; nao acessa Gestta, nao envia dados e nao agenda.
$ErrorActionPreference = 'Stop'
$worker = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$envFile = Join-Path $worker '.env'
try {
    $node = Get-Command node.exe -ErrorAction Stop
    $version = (& $node.Source --version).Trim().TrimStart('v')
    if ([int]($version.Split('.')[0]) -lt 20) { throw "Node.js 20+ necessario. Encontrado: $version" }
    $npm = Get-Command npm.cmd -ErrorAction Stop
    $npx = Get-Command npx.cmd -ErrorAction Stop
} catch {
    Write-Error "Instale Node.js 20+ LTS e reabra o PowerShell. Detalhe: $($_.Exception.Message)"
    exit 1
}
Push-Location $worker
try {
    & $npm.Source install
    if ($LASTEXITCODE -ne 0) { throw 'npm install falhou.' }
    & $npx.Source playwright install chromium
    if ($LASTEXITCODE -ne 0) { throw 'Instalacao do Chromium falhou.' }
    if (-not (Test-Path $envFile)) {
        Copy-Item (Join-Path $worker '.env.example') $envFile
        Write-Host 'Arquivo .env de exemplo criado.'
    } else {
        Write-Host 'Arquivo .env existente preservado.'
    }
    & $npm.Source test
    if ($LASTEXITCODE -ne 0) { throw 'Testes do worker falharam.' }
    Write-Host 'Instalacao concluida; nenhuma tarefa foi agendada.' -ForegroundColor Green
    Write-Host 'Proximo passo: npm run login; depois npm run inspect.'
    Write-Host 'Validacao inicial sem envio: npm run sync -- --file "C:\\caminho\\relatorio.xlsx" --dry-run.'
} catch {
    Write-Error $_
    exit 1
} finally { Pop-Location }