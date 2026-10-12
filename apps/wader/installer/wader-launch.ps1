# ====================================================================
# wader-launch.ps1 -- lancador do servico Wader (spec Fase A, secao 4)
# ====================================================================
# Roda a cada inicio do servico, ANTES do wader.exe. E quem troca arquivos,
# porque nesse momento o exe NAO esta em execucao.
#   pedido.json   -- so o exe escreve; aqui lemos e apagamos.
#   lancador.json -- so este script escreve; o exe le na subida.
# Ordem: voltar (pedido ou 3 quedas) > atualizar (SHA confere) > rodar o exe.
# ASCII PURO de proposito (PowerShell 5.1 sem BOM = ANSI).
# ====================================================================
param(
  [string]$ProgramDir = 'C:\Program Files\Wader',
  [string]$DataDir    = 'C:\ProgramData\Wader',
  [string]$ExeNome    = 'wader.exe'
)
$ErrorActionPreference = 'Stop'

$exe  = Join-Path $ProgramDir $ExeNome
$prev = "$exe.prev"
$upd  = Join-Path $DataDir 'updates'
New-Item -ItemType Directory -Force -Path $upd | Out-Null
$pedidoPath = Join-Path $upd 'pedido.json'
$lancPath   = Join-Path $upd 'lancador.json'

function Ler-Json($p) {
  if (-not (Test-Path $p)) { return $null }
  try { Get-Content $p -Raw | ConvertFrom-Json } catch { $null }
}
function Gravar-Json($p, $obj) {
  $tmp = "$p.tmp"
  ($obj | ConvertTo-Json -Compress -Depth 4) | Set-Content -Path $tmp -Encoding ASCII
  Move-Item -Force $tmp $p
}
function Sha256($p) { (Get-FileHash -Path $p -Algorithm SHA256).Hash.ToLower() }

# 1. le os dois bilhetes
$pedido = Ler-Json $pedidoPath
$lanc = @{ quedasSeguidas = 0 }
$lido = Ler-Json $lancPath
if ($lido) { $lido.PSObject.Properties | ForEach-Object { $lanc[$_.Name] = $_.Value } }
if (-not $lanc.quedasSeguidas) { $lanc.quedasSeguidas = 0 }
$lanc.Remove('erro')

# 2. voltar: pedido explicito ou 3 quedas seguidas, e existe .prev
$querVoltar = ($pedido -and $pedido.voltar) -or ([int]$lanc.quedasSeguidas -ge 3)
if ($querVoltar -and (Test-Path $prev)) {
  Copy-Item -Force $prev $exe
  if ($lanc.versaoAplicada) { $lanc.versaoRejeitada = $lanc.versaoAplicada; $lanc.Remove('versaoAplicada') }
  $lanc.quedasSeguidas = 0
  Write-Host "lancador: voltou para a versao anterior"
}
# 3. senao, atualizar: binario baixado + SHA-256 conferido (unica conferencia de SHA)
elseif ($pedido -and $pedido.atualizar) {
  $v = [string]$pedido.atualizar
  $novo = Join-Path $upd "wader-v$v.exe"
  $shaPath = "$novo.sha256"
  $ok = (Test-Path $novo) -and (Test-Path $shaPath) -and
        ((Get-Content $shaPath -Raw) -match '^\s*([0-9a-fA-F]{64})') -and
        ($Matches[1].ToLower() -eq (Sha256 $novo))
  if ($ok) {
    Copy-Item -Force $exe $prev
    Copy-Item -Force $novo $exe
    $lanc.versaoAplicada = $v
    $lanc.Remove('versaoRejeitada')
    $lanc.quedasSeguidas = 0
    Write-Host "lancador: aplicou v$v"
  } else {
    $lanc.erro = 'sha'
    Write-Host "lancador: v$v recusada (arquivo ausente ou SHA diferente)"
  }
}

# 4. ultimaSaida vem do pedido; pedido atendido some
if ($pedido) {
  if ($pedido.motivo) { $lanc.ultimaSaida = @{ motivo = [string]$pedido.motivo; em = [string]$pedido.em } }
  Remove-Item -Force $pedidoPath
}
Gravar-Json $lancPath $lanc

# 5. roda o exe e espera (stdout/stderr herdados -> log do WinSW)
$inicio = Get-Date
& $exe
$codigo = $LASTEXITCODE
if ($null -eq $codigo) { $codigo = 1 }
$viveuSeg = ((Get-Date) - $inicio).TotalSeconds
if ($codigo -eq 10) { $lanc.quedasSeguidas = 0 }          # saida planejada nao e queda
elseif ($viveuSeg -lt 300) { $lanc.quedasSeguidas = [int]$lanc.quedasSeguidas + 1 }
else { $lanc.quedasSeguidas = 0 }
Gravar-Json $lancPath $lanc
Write-Host "lancador: exe saiu com $codigo apos $([int]$viveuSeg)s (quedasSeguidas=$($lanc.quedasSeguidas))"
exit $codigo
