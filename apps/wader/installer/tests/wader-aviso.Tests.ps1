BeforeAll {
  . (Join-Path $PSScriptRoot '..\wader-aviso.ps1')   # dot-source: define funcoes, nao entra no loop
  # fixture e UTF-8 sem BOM: o PS 5.1 leria como ANSI com Get-Content -Raw; ReadAllText forca UTF-8
  $script:Fixture = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'health-exemplo.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
  function Novo-Estado { @{ aviso = $null; falhas = 0; parado = $false } }
}

Describe 'Decidir-Toasts' {
  It 'le os campos do contrato (schema 1): versao e aviso existem na fixture' {
    $script:Fixture.schema | Should -Be 1
    $script:Fixture.PSObject.Properties.Name | Should -Contain 'versao'
    $script:Fixture.PSObject.Properties.Name | Should -Contain 'aviso'
  }
  It 'aviso novo -> um toast com o texto; mesmo aviso de novo -> nada' {
    $e = Novo-Estado
    (Decidir-Toasts $script:Fixture $e) | Should -Be @($script:Fixture.aviso)
    @(Decidir-Toasts $script:Fixture $e).Count | Should -Be 0
  }
  It 'aviso volta a null -> nada (nao avisa "tudo bem")' {
    $e = Novo-Estado
    Decidir-Toasts $script:Fixture $e | Out-Null
    $h = $script:Fixture.PSObject.Copy(); $h.aviso = $null
    @(Decidir-Toasts $h $e).Count | Should -Be 0
  }
  It 'duas leituras sem resposta -> "Wader parado" uma vez; voltou -> "Wader de volta (vX)"' {
    $e = Novo-Estado
    @(Decidir-Toasts $null $e).Count | Should -Be 0
    (Decidir-Toasts $null $e) | Should -Be @('Wader parado')
    @(Decidir-Toasts $null $e).Count | Should -Be 0
    $t = Decidir-Toasts $script:Fixture $e
    $t[0] | Should -Be 'Wader de volta (v1.0.0)'
    $t[1] | Should -Be $script:Fixture.aviso
  }
}
