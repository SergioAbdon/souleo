# ====================================================================
# wader-aviso.ps1 -- toast do Windows na sessao do usuario (spec A, secao 9)
# ====================================================================
# Roda como tarefa agendada ao logon (registrar-aviso.ps1). A cada 30 s le
# /health. A REGRA mora no exe (campo `aviso`); aqui so se mostra texto:
#   - texto de `aviso` mudou (e nao e nulo) -> toast com esse texto
#   - duas leituras sem resposta -> "Wader parado"; voltou -> "Wader de volta (vX)"
# ASCII PURO (PowerShell 5.1). Dot-source (". .\wader-aviso.ps1") so define
# as funcoes -- e assim que o Pester testa.
# ====================================================================
param(
  [string]$Url = 'http://127.0.0.1:8043/health',
  [int]$IntervaloSeg = 30
)

$script:AppId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'

function Show-Toast([string]$Titulo, [string]$Texto) {
  try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
    $t = [System.Security.SecurityElement]::Escape($Titulo)
    $x = [System.Security.SecurityElement]::Escape($Texto)
    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml("<toast><visual><binding template='ToastGeneric'><text>$t</text><text>$x</text></binding></visual></toast>")
    $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($script:AppId).Show($toast)
  } catch {
    Write-Host "toast falhou: $($_.Exception.Message)"
  }
}

function Get-Health([string]$Url) {
  try { Invoke-RestMethod -Uri $Url -TimeoutSec 3 } catch { $null }
}

# Decide o que mostrar e atualiza $Estado (hashtable: aviso, falhas, parado).
# Devolve array de textos (pode ser vazio).
function Decidir-Toasts($Health, $Estado) {
  $out = @()
  if ($null -eq $Health) {
    $Estado.falhas = [int]$Estado.falhas + 1
    if ($Estado.falhas -eq 2) { $out += 'Wader parado'; $Estado.parado = $true }
    return $out
  }
  $Estado.falhas = 0
  if ($Estado.parado) { $out += "Wader de volta (v$($Health.versao))"; $Estado.parado = $false }
  $aviso = $Health.aviso
  if ([string]$aviso -ne [string]$Estado.aviso) {
    $Estado.aviso = $aviso
    if ($aviso) { $out += [string]$aviso }
  }
  return $out
}

if ($MyInvocation.InvocationName -ne '.') {
  $estado = @{ aviso = $null; falhas = 0; parado = $false }
  while ($true) {
    $h = Get-Health $Url
    foreach ($texto in (Decidir-Toasts $h $estado)) { Show-Toast 'Wader' $texto }
    Start-Sleep -Seconds $IntervaloSeg
  }
}
