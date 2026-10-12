# Pester 5. Roda o lancador numa pasta temporaria com um stub .cmd no lugar do exe.
BeforeAll {
  $script:Launch = Join-Path $PSScriptRoot '..\wader-launch.ps1'
  function New-Ambiente {
    $raiz = Join-Path ([IO.Path]::GetTempPath()) ('wader-launch-' + [guid]::NewGuid().ToString('N'))
    $prog = Join-Path $raiz 'prog'; $dados = Join-Path $raiz 'dados'
    New-Item -ItemType Directory -Force $prog, $dados, (Join-Path $dados 'updates') | Out-Null
    @{ Prog = $prog; Dados = $dados; Upd = (Join-Path $dados 'updates') }
  }
  function New-Stub($Caminho, [int]$Codigo, [string]$Marca) {
    # .cmd que imprime a marca e sai com o codigo: e o "exe" do teste
    Set-Content -Path $Caminho -Value "@echo off`r`necho $Marca`r`nexit /b $Codigo" -Encoding ASCII
  }
  function Sha($p) { (Get-FileHash -Path $p -Algorithm SHA256).Hash.ToLower() }
  function Rodar($a) {
    & $script:Launch -ProgramDir $a.Prog -DataDir $a.Dados -ExeNome 'stub.cmd' 2>&1
    $global:CodigoSaida = $LASTEXITCODE
  }
  function Lanc($a) { Get-Content (Join-Path $a.Upd 'lancador.json') -Raw | ConvertFrom-Json }
}

Describe 'wader-launch.ps1' {
  It 'aplica atualizar quando o SHA bate, guarda .prev e versaoAplicada, apaga pedido.json' {
    $a = New-Ambiente
    New-Stub (Join-Path $a.Prog 'stub.cmd') 0 'VELHO'
    $novo = Join-Path $a.Upd 'wader-v1.0.1.exe'
    New-Stub $novo 0 'NOVO'
    Set-Content "$novo.sha256" -Value ((Sha $novo) + '  wader.exe') -Encoding ASCII
    Set-Content (Join-Path $a.Upd 'pedido.json') -Value '{"atualizar":"1.0.1","motivo":"atualizacao","em":"2026-10-11T00:00:00Z"}' -Encoding ASCII
    $saida = Rodar $a
    ($saida -join "`n") | Should -Match 'NOVO'
    Get-Content (Join-Path $a.Prog 'stub.cmd.prev') -Raw | Should -Match 'VELHO'
    Test-Path (Join-Path $a.Upd 'pedido.json') | Should -BeFalse
    $l = Lanc $a
    $l.versaoAplicada | Should -Be '1.0.1'
    $l.ultimaSaida.motivo | Should -Be 'atualizacao'
    $l.erro | Should -BeNullOrEmpty
  }

  It 'recusa SHA errado: mantem a versao, grava erro=sha' {
    $a = New-Ambiente
    New-Stub (Join-Path $a.Prog 'stub.cmd') 0 'VELHO'
    $novo = Join-Path $a.Upd 'wader-v1.0.1.exe'
    New-Stub $novo 0 'NOVO'
    Set-Content "$novo.sha256" -Value ('0' * 64) -Encoding ASCII
    Set-Content (Join-Path $a.Upd 'pedido.json') -Value '{"atualizar":"1.0.1","motivo":"atualizacao","em":"x"}' -Encoding ASCII
    $saida = Rodar $a
    ($saida -join "`n") | Should -Match 'VELHO'
    (Lanc $a).erro | Should -Be 'sha'
    Test-Path (Join-Path $a.Prog 'stub.cmd.prev') | Should -BeFalse
  }

  It 'e idempotente: exe ja e o novo (queda apos a copia) nao sobrescreve o .prev' {
    $a = New-Ambiente
    New-Stub (Join-Path $a.Prog 'stub.cmd.prev') 0 'VELHO'
    $novo = Join-Path $a.Upd 'wader-v1.0.1.exe'
    New-Stub $novo 0 'NOVO'
    New-Stub (Join-Path $a.Prog 'stub.cmd') 0 'NOVO'
    Set-Content "$novo.sha256" -Value ((Sha $novo) + '  wader.exe') -Encoding ASCII
    Set-Content (Join-Path $a.Upd 'pedido.json') -Value '{"atualizar":"1.0.1","motivo":"atualizacao","em":"x"}' -Encoding ASCII
    $saida = Rodar $a
    ($saida -join "`n") | Should -Match 'NOVO'
    Get-Content (Join-Path $a.Prog 'stub.cmd.prev') -Raw | Should -Match 'VELHO'
    Test-Path (Join-Path $a.Upd 'pedido.json') | Should -BeFalse
    (Lanc $a).versaoAplicada | Should -Be '1.0.1'
  }

  It 'voltar pedido sem .prev: segue com o exe atual e grava erro=prev' {
    $a = New-Ambiente
    New-Stub (Join-Path $a.Prog 'stub.cmd') 0 'ATUAL'
    Set-Content (Join-Path $a.Upd 'pedido.json') -Value '{"voltar":true,"motivo":"rollback","em":"x"}' -Encoding ASCII
    ((Rodar $a) -join "`n") | Should -Match 'ATUAL'
    (Lanc $a).erro | Should -Be 'prev'
    Test-Path (Join-Path $a.Upd 'pedido.json') | Should -BeFalse
  }

  It 'exe ausente conta como queda (codigo 1) em vez de matar o lancador' {
    $a = New-Ambiente
    Rodar $a | Out-Null
    $global:CodigoSaida | Should -Be 1
    (Lanc $a).quedasSeguidas | Should -Be 1
  }

  It 'volta pra .prev por pedido voltar e por 3 quedas seguidas (versaoRejeitada = versaoAplicada)' {
    # por pedido
    $a = New-Ambiente
    New-Stub (Join-Path $a.Prog 'stub.cmd') 0 'ATUAL'
    New-Stub (Join-Path $a.Prog 'stub.cmd.prev') 0 'ANTERIOR'
    Set-Content (Join-Path $a.Upd 'lancador.json') -Value '{"quedasSeguidas":0,"versaoAplicada":"1.0.1"}' -Encoding ASCII
    Set-Content (Join-Path $a.Upd 'pedido.json') -Value '{"voltar":true,"motivo":"rollback","em":"x"}' -Encoding ASCII
    ((Rodar $a) -join "`n") | Should -Match 'ANTERIOR'
    (Lanc $a).versaoRejeitada | Should -Be '1.0.1'
    # por quedas
    $b = New-Ambiente
    New-Stub (Join-Path $b.Prog 'stub.cmd') 0 'ATUAL'
    New-Stub (Join-Path $b.Prog 'stub.cmd.prev') 0 'ANTERIOR'
    Set-Content (Join-Path $b.Upd 'lancador.json') -Value '{"quedasSeguidas":3,"versaoAplicada":"1.0.1"}' -Encoding ASCII
    ((Rodar $b) -join "`n") | Should -Match 'ANTERIOR'
    (Lanc $b).versaoRejeitada | Should -Be '1.0.1'
    (Lanc $b).quedasSeguidas | Should -Be 1   # o stub saiu em < 5 min: conta como queda
  }

  It 'conta quedas (< 5 min) e sai com o codigo do exe; saida 10 nao conta como queda' {
    $a = New-Ambiente
    New-Stub (Join-Path $a.Prog 'stub.cmd') 7 'CAIU'
    Rodar $a | Out-Null
    $global:CodigoSaida | Should -Be 7
    (Lanc $a).quedasSeguidas | Should -Be 1
    Rodar $a | Out-Null
    (Lanc $a).quedasSeguidas | Should -Be 2
    New-Stub (Join-Path $a.Prog 'stub.cmd') 10 'ATUALIZANDO'
    Rodar $a | Out-Null
    $global:CodigoSaida | Should -Be 10
    (Lanc $a).quedasSeguidas | Should -Be 0
  }
}
