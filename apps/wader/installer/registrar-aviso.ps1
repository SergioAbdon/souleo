# registrar-aviso.ps1 -- cria/remove a tarefa agendada "Wader-Aviso"
# (ao logon de QUALQUER usuario, sem janela). Chamado pelo instalador Inno.
param(
  [string]$Instalar,   # caminho completo do wader-aviso.ps1
  [switch]$Remover
)
$ErrorActionPreference = 'Stop'
$nome = 'Wader-Aviso'
# valida ANTES de mexer: uso errado nao apaga a tarefa
if (-not $Remover -and -not $Instalar) { throw 'use -Instalar <caminho do wader-aviso.ps1> ou -Remover' }
# para o loop antigo antes de remover (senao segue rodando apos upgrade/desinstalar)
Stop-ScheduledTask -TaskName $nome -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $nome -Confirm:$false -ErrorAction SilentlyContinue
if ($Remover) { Write-Host "tarefa $nome removida"; exit 0 }
$acao = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Instalar`""
$gatilho = New-ScheduledTaskTrigger -AtLogOn
# BUILTIN\Users (S-1-5-32-545) = roda na sessao de quem logar, sem privilegio
$principal = New-ScheduledTaskPrincipal -GroupId 'S-1-5-32-545' -RunLevel Limited
$cfg = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Principal $principal -Settings $cfg | Out-Null
Write-Host "tarefa $nome registrada"
