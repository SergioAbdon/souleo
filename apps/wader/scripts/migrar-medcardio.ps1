# ====================================================================
# migrar-medcardio.ps1 -- visita unica: C:\Wader (npm start) -> ProgramData
# ====================================================================
# Rodar ANTES do Wader-Setup, como admin. Dry-run por padrao; -Commit executa.
#   1. mata o node.exe que roda "tsx src/index" e ESPERA sumir (ate 30 s)
#   2. copia wader.config.json, sa.json, .wader-ingest-state.json -> ProgramData
#      (ignora wader.config.local.json: load.ts da precedencia a ele)
#   3. reescreve firebase.serviceAccountPath; mantem agentId (wader-001);
#      pede adminPin se faltar; da permissao de escrita na pasta de worklists
#   4. C:\Wader fica INTACTO como rollback ate o Sergio apagar
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

foreach ($f in 'wader.config.json', 'sa.json') {
  if (-not (Test-Path (Join-Path $Origem $f))) { throw "Nao achei $Origem\$f" }
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

# 2. copia
Write-Host "2. copiar config/sa/cursor -> $Destino"
if ($Commit) { New-Item -ItemType Directory -Force $Destino, "$Destino\updates", "$Destino\logs" | Out-Null }
foreach ($f in 'wader.config.json', 'sa.json', '.wader-ingest-state.json') {
  $src = Join-Path $Origem $f
  if (Test-Path $src) {
    Write-Host "   $f"
    if ($Commit) { Copy-Item -Force $src (Join-Path $Destino $f) }
  }
}

# 3. reescreve config
$cfgPath = Join-Path $Origem 'wader.config.json'
$cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
$cfg.firebase.serviceAccountPath = Join-Path $Destino 'sa.json'
if (-not $cfg.agentId) { $cfg | Add-Member -NotePropertyName agentId -NotePropertyValue 'wader-001' -Force }
if (-not $cfg.adminPin) {
  $pin = Read-Host 'PIN do painel de atualizacao (6 digitos)'
  if ($pin -notmatch '^\d{6}$') { throw 'PIN precisa ter 6 digitos' }
  $cfg | Add-Member -NotePropertyName adminPin -NotePropertyValue $pin -Force
}
Write-Host "3. config: serviceAccountPath=$($cfg.firebase.serviceAccountPath) agentId=$($cfg.agentId) worklistPath=$($cfg.orthanc.worklistPath)"
if ($Commit) {
  # UTF-8 sem BOM (Set-Content -Encoding UTF8 do 5.1 grava BOM)
  [IO.File]::WriteAllText((Join-Path $Destino 'wader.config.json'), ($cfg | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding $false))
  icacls (Join-Path $Destino 'sa.json') /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' '*S-1-5-20:R' | Out-Null
  # corta heranca de ProgramData: Users nao pode plantar updates\ (rodaria como NetworkService)
  icacls $Destino /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' '*S-1-5-20:(OI)(CI)M' | Out-Null
  icacls $cfg.orthanc.worklistPath /grant '*S-1-5-20:(OI)(CI)M' | Out-Null
}

Write-Host "4. $Origem fica intacto (rollback). Agora rode o Wader-Setup-vX.exe." -ForegroundColor Green
