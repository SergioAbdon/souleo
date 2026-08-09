# ====================================================================
# update-wader.ps1 -- Atualiza o Wader rodando na maquina da clinica
# ====================================================================
#
# IMPORTANTE: arquivo em ASCII PURO de proposito. O Windows PowerShell 5.1
# da clinica le .ps1 sem BOM como ANSI; travessoes/acentos/emojis viravam
# erro de parse ("Unexpected token"). Nao reintroduza caracteres nao-ASCII.
#
# POR QUE EXISTE: o Wader (C:\Wader\) NAO tem deploy automatico. O Leo
# deploya via Vercel no push pro master; o Wader e copia MANUAL. Toda vez
# que um PR que toca apps/wader/ e mergeado, alguem PRECISA rodar isto na
# maquina da clinica pra o Wader em producao receber o codigo novo.
#
# Historico: em 16/05/2026 o Wader rodou 8 DIAS defasado (codigo de 08/05,
# sem fixes #7/#15/#23/#27) porque ninguem atualizou manualmente. Exames
# chegavam incompletos (2 de 14 imagens, 0 SR). Ver ADR secao 15 +
# memoria feedback_wader_deploy_manual.md.
#
# O QUE FAZ (idempotente, seguro):
#   1. Backup do C:\Wader\src atual -> C:\Wader\src.bak-AAAAMMDD-HHMM
#   2. Copia C:\souleo\apps\wader\src\* -> C:\Wader\src\ (so codigo)
#   3. Preserva intocados: sa.json, wader.config.json, node_modules, scripts
#   4. npm install SO se package.json deps mudaram
#   5. Mata o Wader rodando + reinicia (npm start em janela nova)
#   6. Grava C:\Wader\DEPLOYED.json (rastreabilidade da versao)
#
# USO (PowerShell na maquina da clinica):
#   cd C:\souleo ; git pull origin master
#   .\apps\wader\scripts\update-wader.ps1
#
# Rollback: pare o Wader, apague src, renomeie o src.bak-* mais recente
#           pra src, reinicie.
# ====================================================================

$ErrorActionPreference = 'Stop'

$repo   = 'C:\souleo'
$wader  = 'C:\Wader'
$repoSrc = Join-Path $repo 'apps\wader\src'

Write-Host "=== update-wader ===" -ForegroundColor Cyan

if (-not (Test-Path $repoSrc))      { throw "Nao achei $repoSrc -- repo souleo presente?" }
if (-not (Test-Path "$wader\src"))  { throw "Nao achei $wader\src -- Wader instalado?" }

# 1. Backup
$stamp  = Get-Date -Format 'yyyyMMdd-HHmm'
$backup = Join-Path $wader "src.bak-$stamp"
Write-Host "1. Backup -> $backup"
Copy-Item "$wader\src" $backup -Recurse -Force

# 2. Copia codigo novo (so src -- credenciais/config/node_modules ficam fora)
Write-Host "2. Copiando apps\wader\src -> C:\Wader\src"
Copy-Item "$repoSrc\*" "$wader\src\" -Recurse -Force

# 2b. Remove arquivos de teste da producao (inertes, mas nao precisam ir).
Get-ChildItem "$wader\src" -Recurse -Filter '*.test.ts' -EA SilentlyContinue |
  ForEach-Object { Remove-Item $_.FullName -Force -EA SilentlyContinue }

# 3. (preservados automaticamente -- sa.json/config/node_modules/scripts estao fora de src\)
Write-Host "3. Preservados: sa.json, wader.config.json, node_modules, scripts (fora de src\)"

# 4. npm install so se deps mudaram
$depsRepo  = (Get-Content (Join-Path $repo 'apps\wader\package.json') -Raw | ConvertFrom-Json).dependencies | ConvertTo-Json -Compress
$depsWader = (Get-Content (Join-Path $wader 'package.json') -Raw | ConvertFrom-Json).dependencies | ConvertTo-Json -Compress
Copy-Item (Join-Path $repo 'apps\wader\package.json') (Join-Path $wader 'package.json') -Force
if ($depsRepo -ne $depsWader) {
  Write-Host "4. package.json deps MUDARAM -> npm install" -ForegroundColor Yellow
  Push-Location $wader ; npm install ; Pop-Location
} else {
  Write-Host "4. deps identicas -> npm install pulado"
}

# 5. Reiniciar Wader
Write-Host "5. Reiniciando Wader..."
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -EA SilentlyContinue |
  Where-Object { $_.CommandLine -like '*tsx*src*index*' } |
  ForEach-Object { Write-Host "   matando PID $($_.ProcessId)" ; Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }
Start-Sleep -Seconds 2
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','cd /d C:\Wader && npm start' -WindowStyle Minimized

# 6. Marcador de versao
Push-Location $repo
$waderCommit = (git log -1 --format=%H -- apps/wader/)
$waderShort  = (git log -1 --format=%h -- apps/wader/)
$headShort   = (git rev-parse --short HEAD)
Pop-Location
$deployed = [ordered]@{
  _comment              = 'Versao do codigo Wader rodando NESTA maquina. Estado local, NAO versionado. Regravado por update-wader.ps1.'
  waderCodeCommit       = $waderCommit
  waderCodeCommitShort  = $waderShort
  repoHeadNaAtualizacao = $headShort
  atualizadoEm          = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
  atualizadoPor         = 'update-wader.ps1'
  backupAnterior        = $backup
}
$deployed | ConvertTo-Json | Out-File -FilePath (Join-Path $wader 'DEPLOYED.json') -Encoding utf8

Write-Host ""
Write-Host "OK Wader atualizado (waderCommit=$waderShort, repoHEAD=$headShort) e reiniciando." -ForegroundColor Green
Write-Host "   Confira: http://127.0.0.1:8043/health  |  log na janela cmd minimizada"
Write-Host "   Rollback: pare o Wader, restaure $backup -> src, reinicie"
