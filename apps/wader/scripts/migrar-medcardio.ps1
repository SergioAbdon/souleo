# ====================================================================
# migrar-medcardio.ps1 -- visita unica: C:\Wader (npm start) -> ProgramData
# ====================================================================
# Rodar ANTES do Wader-Setup, como admin. Dry-run por padrao; -Commit executa.
#   0. valida config e pede adminPin se faltar (ANTES de mexer em qualquer coisa)
#   1. mata o node.exe que roda "tsx src/index" e ESPERA sumir (ate 30 s)
#   2. cria ProgramData\Wader e FECHA a ACL (dono, reset, sem heranca) antes de copiar
#   3. copia wader.config.json, sa.json, .wader-ingest-state.json -> ProgramData
#      (ignora wader.config.local.json: load.ts da precedencia a ele -- avisa se existir)
#   4. reescreve firebase.serviceAccountPath; mantem agentId (wader-001);
#      da permissao de escrita na pasta de worklists
#   5. C:\Wader fica INTACTO como rollback ate o Sergio apagar
# ASCII PURO (PowerShell 5.1).
# ====================================================================
param(
  [string]$Origem  = 'C:\Wader',
  [string]$Destino = 'C:\ProgramData\Wader',
  [switch]$Commit
)
$ErrorActionPreference = 'Stop'
$modo = if ($Commit) { 'COMMIT' } else { 'DRY-RUN (use -Commit para executar)' }
Write-Host "=== migrar-medcardio [$modo] ===" -ForegroundColor Cyan

function Icacls-Ok {
  icacls @args | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "icacls falhou: $($args -join ' ')" }
}

# 0. valida tudo e pede o PIN antes de matar/copiar
foreach ($f in 'wader.config.json', 'sa.json') {
  if (-not (Test-Path (Join-Path $Origem $f))) { throw "Nao achei $Origem\$f" }
}
$local = Join-Path $Origem 'wader.config.local.json'
if (Test-Path $local) {
  Write-Warning "$local existe e NAO sera copiado. Confira se ha valores reais nele (wsId, orthanc, firebase) que precisam ir pro wader.config.json."
}
$cfg = Get-Content (Join-Path $Origem 'wader.config.json') -Raw | ConvertFrom-Json
$wlExiste = Test-Path $cfg.orthanc.worklistPath
if (-not $wlExiste) { Write-Warning "pasta de worklists nao existe: $($cfg.orthanc.worklistPath) (permissao dela sera pulada)" }
$cfg.firebase.serviceAccountPath = Join-Path $Destino 'sa.json'
if (-not $cfg.agentId) { $cfg | Add-Member -NotePropertyName agentId -NotePropertyValue 'wader-001' -Force }
if (-not $cfg.adminPin) {
  $pin = Read-Host 'PIN do painel de atualizacao (6 digitos)'
  if ($pin -notmatch '^\d{6}$') { throw 'PIN precisa ter 6 digitos' }
  $cfg | Add-Member -NotePropertyName adminPin -NotePropertyValue $pin -Force
}

# 1. mata o Wader antigo
$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*tsx*src*index*' }
foreach ($p in $procs) {
  Write-Host "1. matar node PID $($p.ProcessId)"
  if ($Commit) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
}
if ($Commit -and $procs) {
  $t = 0
  while ($t -lt 30 -and (Get-Process -Id ($procs | ForEach-Object ProcessId) -ErrorAction SilentlyContinue)) { Start-Sleep 1; $t++ }
  if ($t -ge 30) { throw 'node.exe do Wader nao morreu em 30 s' }
}

# 2. pasta + ACL fechada ANTES de copiar segredo
# Usuarios por padrao criam arquivo em ProgramData: poderiam plantar updates\ (rodaria como
# NetworkService). /grant:r nao tira ACE explicita de outro SID nem troca o dono.
# Sem /C de proposito: com /C o icacls devolve 0 mesmo falhando.
Write-Host "2. criar $Destino e fechar a ACL (Administradores, SYSTEM, NetworkService)"
if ($Commit) {
  New-Item -ItemType Directory -Force $Destino, "$Destino\updates", "$Destino\logs" | Out-Null
  Icacls-Ok $Destino /setowner '*S-1-5-32-544' /T /Q
  Icacls-Ok $Destino /reset /T /Q
  Icacls-Ok $Destino /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' '*S-1-5-20:(OI)(CI)M'
}

# 3. copia
Write-Host "3. copiar config/sa/cursor -> $Destino"
foreach ($f in 'wader.config.json', 'sa.json', '.wader-ingest-state.json') {
  $src = Join-Path $Origem $f
  if (Test-Path $src) {
    Write-Host "   $f"
    if ($Commit) { Copy-Item -Force $src (Join-Path $Destino $f) }
  }
}

# 4. reescreve config + ACL do sa.json e da pasta de worklists
Write-Host "4. config: serviceAccountPath=$($cfg.firebase.serviceAccountPath) agentId=$($cfg.agentId) worklistPath=$($cfg.orthanc.worklistPath)"
if ($Commit) {
  # UTF-8 sem BOM (Set-Content -Encoding UTF8 do 5.1 grava BOM)
  [IO.File]::WriteAllText((Join-Path $Destino 'wader.config.json'), ($cfg | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding $false))
  Icacls-Ok (Join-Path $Destino 'sa.json') /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' '*S-1-5-20:R'
  if ($wlExiste) { Icacls-Ok $cfg.orthanc.worklistPath /grant '*S-1-5-20:(OI)(CI)M' }
}

Write-Host "5. $Origem fica intacto (rollback). Agora rode o Wader-Setup-vX.exe." -ForegroundColor Green
