# ====================================================================
# wader-launch.ps1 -- lancador do servico Wader (spec Fase A, secao 4)
# ====================================================================
# Roda a cada inicio do servico, ANTES do wader.exe. E quem troca arquivos,
# porque nesse momento o exe NAO esta em execucao.
#   pedido.json   -- so o exe escreve; aqui lemos e apagamos.
#   lancador.json -- so este script escreve; o exe le na subida.
# Ordem: voltar (pedido ou 3 quedas) > atualizar (SHA confere) > rodar o exe.
# Saida 10 (atualizacao pedida) volta ao inicio AQUI, sem devolver ao WinSW
# (cada saida != 0 gasta um degrau da escada de reinicio).
# ASCII PURO de proposito (PowerShell 5.1 sem BOM = ANSI).
# ====================================================================
param(
  [string]$ProgramDir = 'C:\Program Files\Wader\bin',
  [string]$DataDir    = 'C:\ProgramData\Wader',
  [string]$ExeNome    = 'wader.exe',
  # vida minima (s) para a saida zerar quedasSeguidas; parametro so para o Pester
  [int]$VidaMinSeg    = 300
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
# troca: copia pra .tmp e renomeia por cima do existente. PS 5.1 pode apagar-e-mover
# (janela sem exe); a restauracao do .prev no inicio do laco cobre essa janela.
function Instalar($origem) {
  Copy-Item -Force $origem "$exe.tmp"
  Move-Item -Force "$exe.tmp" $exe
}

$passes = 0
do {
  $passes++
  # 1. le os dois bilhetes (de novo a cada volta: o exe acabou de gravar o pedido)
  $pedido = Ler-Json $pedidoPath
  $lanc = @{ quedasSeguidas = 0 }
  $lido = Ler-Json $lancPath
  if ($lido) { $lido.PSObject.Properties | ForEach-Object { $lanc[$_.Name] = $_.Value } }
  if (-not $lanc.quedasSeguidas) { $lanc.quedasSeguidas = 0 }
  $lanc.Remove('erro')

  # instalacao quebrada: exe sumiu mas o .prev existe
  if ((-not (Test-Path $exe)) -and (Test-Path $prev)) {
    Instalar $prev
    Write-Host "lancador: $exe ausente, restaurado do .prev"
  }

  # 2. voltar: pedido explicito ou 3 quedas seguidas, e existe .prev
  $porQuedas = [int]$lanc.quedasSeguidas -ge 3
  $pedeVoltar = [bool]($pedido -and $pedido.voltar)
  if (($pedeVoltar -or $porQuedas) -and (Test-Path $prev)) {
    Instalar $prev
    # versaoRejeitada so no rollback automatico; voltar manual nao rejeita nada
    if ($porQuedas -and $lanc.versaoAplicada) { $lanc.versaoRejeitada = $lanc.versaoAplicada }
    $lanc.Remove('versaoAplicada')
    $lanc.Remove('atualizando')
    $lanc.quedasSeguidas = 0
    Write-Host "lancador: voltou para a versao anterior"
  }
  # voltar pedido PELO USUARIO sem .prev: registra o erro e NAO atualiza neste inicio.
  # (3 quedas sem .prev segue pro atualizar abaixo: uma versao nova ainda pode consertar)
  elseif ($pedeVoltar) {
    $lanc.erro = 'prev'
    Write-Host "lancador: voltar pedido mas nao existe .prev"
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
      # retomavel: 'atualizando' marcado ANTES de tocar no exe. Na retomada (queda de luz no
      # meio) o .prev ja e o velho bom e NAO e sobrescrito pelo exe atual.
      if ($lanc.atualizando -ne $v) {
        if ((Test-Path $exe) -and ((Sha256 $exe) -ne (Sha256 $novo))) { Copy-Item -Force $exe $prev }
        $lanc.atualizando = $v
        Gravar-Json $lancPath $lanc
      }
      Instalar $novo
      $lanc.versaoAplicada = $v
      $lanc.Remove('atualizando')
      $lanc.Remove('versaoRejeitada')
      $lanc.quedasSeguidas = 0
      # limpeza: binarios baixados de outras versoes
      Get-ChildItem -Path $upd -File | Where-Object {
        $_.Name -match '^wader-v(.+)\.exe(\.sha256)?$' -and $Matches[1] -ne $v
      } | Remove-Item -Force
      Write-Host "lancador: aplicou v$v"
    } else {
      $lanc.erro = 'sha'
      Write-Host "lancador: v$v recusada (arquivo ausente ou SHA diferente)"
    }
  }

  # 4. ultimaSaida vem do pedido; pedido atendido some
  if ($pedido) {
    if ($pedido.motivo) { $lanc.ultimaSaida = @{ motivo = [string]$pedido.motivo; em = [string]$pedido.em } }
  }
  # lancador.json ANTES de apagar o pedido: queda entre os dois nunca deixa exe novo sem versaoAplicada
  Gravar-Json $lancPath $lanc
  if ($pedido) { Remove-Item -Force $pedidoPath }

  # 5. roda o exe e espera (stdout/stderr herdados -> log do WinSW)
  # cwd = DataDir: o exe resolve updates/ a partir do process.cwd()
  $inicio = Get-Date
  Set-Location $DataDir
  $codigo = $null
  try { & $exe; $codigo = $LASTEXITCODE }
  catch { Write-Host "lancador: nao consegui executar $exe : $($_.Exception.Message)"; $codigo = 1 }
  if ($null -eq $codigo) { $codigo = 1 }
  $viveuSeg = ((Get-Date) - $inicio).TotalSeconds

  # 2 = config/credencial/porta, 10 = atualizacao pedida, 3+lider = rede: nao e culpa do binario
  $pedPos = Ler-Json $pedidoPath
  $naoConta = ($codigo -eq 2) -or ($codigo -eq 10) -or ($pedPos -and $pedPos.motivo -eq 'lider')
  # vida longa (>= VidaMinSeg) zera para QUALQUER codigo; saida cedo so conta se nao e naoConta
  if ($viveuSeg -ge $VidaMinSeg) { $lanc.quedasSeguidas = 0 }
  elseif (-not $naoConta) { $lanc.quedasSeguidas = [int]$lanc.quedasSeguidas + 1 }
  # sem pedido o motivo e o proprio codigo (com pedido, o proximo inicio grava o motivo dele)
  if ((-not $pedPos) -and ($codigo -ne 0)) {
    $lanc.ultimaSaida = @{ motivo = "codigo-$codigo"; em = (Get-Date).ToUniversalTime().ToString('o') }
  }
  Gravar-Json $lancPath $lanc
  Write-Host "lancador: exe saiu com $codigo apos $([int]$viveuSeg)s (quedasSeguidas=$($lanc.quedasSeguidas))"
  if (($codigo -eq 10) -and ($passes -ge 5)) {
    Write-Host "lancador: saida 10 em $passes voltas seguidas -- desistindo (saida 1)"
    exit 1
  }
} while ($codigo -eq 10)

exit $codigo
