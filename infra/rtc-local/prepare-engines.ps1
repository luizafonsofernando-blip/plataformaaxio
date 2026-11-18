$ErrorActionPreference = 'Stop'
$sources = if ($env:RTC_SOURCES_ROOT) { $env:RTC_SOURCES_ROOT } else { Join-Path $env:LOCALAPPDATA 'LuceRTC' }
$env:RTC_SOURCES_ROOT = $sources
if (-not (Test-Path -LiteralPath $sources)) { New-Item -ItemType Directory -Path $sources | Out-Null }
$dockerfiles = Join-Path $PSScriptRoot 'docker'
$engines = @(
  @{ Name = 'regular'; Repository = 'calculadora-rtc-regime-regular'; Tag = '1.6.1'; Commit = '150cccbe414d4a5edea703e4f7a424af5aa222c7' },
  @{ Name = 'simples'; Repository = 'calculadora-rtc-simples-nacional'; Tag = '0.0.6'; Commit = 'c5b0f01c8351c3f0d0795cc617b29d233e9f98df' },
  @{ Name = 'danfse'; Repository = 'calculadora-rtc-gerador-danfse'; Tag = '1.0.0'; Commit = '8d79e6b2f7fad6375340afcb51c85ed370c64a14' }
)
foreach ($engine in $engines) {
  $target = Join-Path $sources $engine.Name
  if (-not (Test-Path -LiteralPath $target)) {
    git -c core.longpaths=true clone --depth 1 --branch $engine.Tag "https://github.com/ReceitaFederal/$($engine.Repository).git" $target
    if ($LASTEXITCODE -ne 0) { throw "Falha no checkout de $($engine.Name)." }
  }
  $actual = (git -C $target rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or $actual -ne $engine.Commit) { throw "Commit oficial divergente para $($engine.Name): $actual" }
  $missing = @(git -C $target status --porcelain | Where-Object { $_ -match '^ D ' })
  if ($missing.Count) { throw "Checkout incompleto para $($engine.Name); use outro RTC_SOURCES_ROOT vazio." }
}
$flywayTarget = Join-Path $sources 'simples\flyway'
if (-not (Test-Path -LiteralPath $flywayTarget)) { New-Item -ItemType Directory -Path $flywayTarget | Out-Null }
Copy-Item -Path (Join-Path $sources 'regular\flyway\*') -Destination $flywayTarget -Recurse -Force
foreach ($name in @('regular', 'simples')) {
  Copy-Item -LiteralPath (Join-Path $dockerfiles "Dockerfile.$name") -Destination (Join-Path $sources "$name\Dockerfile.luce") -Force
  Copy-Item -LiteralPath (Join-Path $dockerfiles '.dockerignore') -Destination (Join-Path $sources "$name\.dockerignore") -Force
}
Write-Output "Fontes oficiais fixadas preparadas em $sources. Execute os testes oficiais antes de usar os motores."
