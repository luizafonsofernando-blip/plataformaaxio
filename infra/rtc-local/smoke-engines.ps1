param([string]$Data = (Get-Date -Format 'yyyy-MM-dd'))
$ErrorActionPreference = 'Stop'
if ($Data -notmatch '^\d{4}-\d{2}-\d{2}$') { throw 'Data inválida. Use AAAA-MM-DD.' }
if (-not $env:RTC_GATEWAY_TOKEN) { throw 'RTC_GATEWAY_TOKEN não definido.' }
$base = 'http://127.0.0.1:58080'
$headers = @{ authorization = "Bearer $env:RTC_GATEWAY_TOKEN" }
$regular = Invoke-RestMethod -Uri "$base/api/calculadora/dados-abertos/versao" -Headers $headers -TimeoutSec 12
if ($regular.versaoApp -ne '1.6.1' -or -not $regular.versaoDb) { throw 'Versão/base do Regime Regular inválida.' }
$regularCatalog = @(Invoke-RestMethod -Uri "$base/api/calculadora/dados-abertos/situacoes-tributarias/cbs-ibs?data=$Data" -Headers $headers -TimeoutSec 12)
if ($regularCatalog.Count -eq 0 -or -not $regularCatalog[0].codigo) { throw 'Catálogo Regular vazio ou inválido.' }
$simples = Invoke-RestMethod -Uri "$base/api/versao" -Headers $headers -TimeoutSec 12
if ($simples.versaoApp -ne '0.0.6' -or -not $simples.versaoDb) { throw 'Versão/base do Simples inválida.' }
$simpleCatalog = @(Invoke-RestMethod -Uri "$base/api/calculadora/simples-nacional/atividades?data=$Data" -Headers $headers -TimeoutSec 12)
if ($simpleCatalog.Count -eq 0 -or -not $simpleCatalog[0].codigo) { throw 'Catálogo Simples vazio ou inválido.' }
$ready = Invoke-WebRequest -Uri "$base/health/ready" -Headers $headers -TimeoutSec 12
if ($ready.StatusCode -ne 200) { throw 'DANFSe não está pronto.' }
Write-Output "Consulta real concluída para $Data. Regular $($regular.versaoApp) / base $($regular.versaoDb): $($regularCatalog.Count) linhas. Simples $($simples.versaoApp) / base $($simples.versaoDb): $($simpleCatalog.Count) linhas. DANFSe: pronto."
