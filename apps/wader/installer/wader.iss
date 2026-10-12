; Wader-Setup -- instalador generico (nao sabe nada da MedCardio). Spec Fase A, secao 10.
; Compilar: iscc /Q /DVersao=1.0.0 wader.iss   (OutputDir = ..\build)
#ifndef Versao
  #define Versao "0.0.0"
#endif

[Setup]
AppId={{7D3B2E1A-5C44-4B7F-9A61-0F2E8C1D4A90}
AppName=Wader
AppVersion={#Versao}
AppPublisher=LEO
DefaultDirName={autopf}\Wader
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\build
OutputBaseFilename=Wader-Setup-v{#Versao}
Compression=lzma2
SolidCompression=yes
CloseApplications=no
UninstallDisplayName=Wader

[Files]
Source: "..\build\wader.exe";         DestDir: "{app}"; Flags: ignoreversion
Source: "..\build\wader-service.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "wader-service.xml";          DestDir: "{app}"; Flags: ignoreversion
Source: "wader-launch.ps1";           DestDir: "{app}"; Flags: ignoreversion
Source: "wader-aviso.ps1";            DestDir: "{app}"; Flags: ignoreversion
Source: "registrar-aviso.ps1";        DestDir: "{app}"; Flags: ignoreversion

[Dirs]
; Dados sobrevivem a desinstalar/reinstalar. NetworkService precisa escrever aqui.
; (O icacls em PrepararDados corta a heranca -- Users nao pode plantar updates\.)
Name: "{commonappdata}\Wader";         Permissions: admins-full networkservice-modify
Name: "{commonappdata}\Wader\updates"
Name: "{commonappdata}\Wader\logs"
; O lancador (roda como NetworkService) troca wader.exe <-> wader.exe.prev aqui.
Name: "{app}"; Permissions: networkservice-modify

[Run]
; O "stopwait" da atualizacao por cima fica em PrepareToInstall (antes de copiar arquivos).
; [Run] roda ANTES de ssPostInstall: config + ACL vao no BeforeInstall do "start".
Filename: "{app}\wader-service.exe"; Parameters: "install"; Flags: runhidden waituntilterminated; Check: not ServicoExiste
Filename: "{app}\wader-service.exe"; Parameters: "start";   Flags: runhidden waituntilterminated; BeforeInstall: PrepararDados
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\registrar-aviso.ps1"" -Instalar ""{app}\wader-aviso.ps1"""; Flags: runhidden waituntilterminated

[UninstallRun]
Filename: "{app}\wader-service.exe"; Parameters: "stopwait";  Flags: runhidden waituntilterminated; RunOnceId: "parar"
Filename: "{app}\wader-service.exe"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "desinstalar"
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\registrar-aviso.ps1"" -Remover"; Flags: runhidden waituntilterminated; RunOnceId: "aviso"

[Code]
var
  PgDados: TInputQueryWizardPage;
  PgSa: TInputFileWizardPage;
  Primeira: Boolean;

function ConfigPath: String;
begin
  Result := ExpandConstant('{commonappdata}\Wader\wader.config.json');
end;

function ServicoExiste: Boolean;
var R: Integer;
begin
  // `sc query Wader` devolve 0 se existe, 1060 se nao
  Result := Exec('sc.exe', 'query Wader', '', SW_HIDE, ewWaitUntilTerminated, R) and (R = 0);
end;

// Atualizacao por cima: para o servico ANTES de [Files] (senao wader.exe esta em uso).
function PrepareToInstall(var NeedsRestart: Boolean): String;
var R: Integer;
begin
  if ServicoExiste then begin
    // stopwait = para e espera o servico parar de verdade (WinSW 2.x)
    Exec(ExpandConstant('{app}\wader-service.exe'), 'stopwait', '', SW_HIDE, ewWaitUntilTerminated, R);
  end;
  Result := '';
end;

procedure InitializeWizard;
begin
  Primeira := not FileExists(ConfigPath);
  PgDados := CreateInputQueryPage(wpSelectDir, 'Dados da clinica', 'Primeira instalacao',
    'Estes dados vao para C:\ProgramData\Wader\wader.config.json. Podem ser editados depois.');
  PgDados.Add('Workspace do LEO (wsId):', False);
  PgDados.Add('Pasta de worklists do Orthanc (ex.: C:\Orthanc\worklists):', False);
  PgDados.Add('PIN do painel de atualizacao (6 digitos):', True);
  PgSa := CreateInputFilePage(PgDados.ID, 'Credencial do Firebase', 'Arquivo sa.json',
    'Escolha o sa.json da clinica. Ele sera copiado para C:\ProgramData\Wader com acesso restrito.');
  PgSa.Add('Arquivo sa.json:', 'JSON|*.json', '.json');
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := (not Primeira) and ((PageID = PgDados.ID) or (PageID = PgSa.ID));
end;

function PinValido(const S: String): Boolean;
var I: Integer;
begin
  Result := Length(S) = 6;
  for I := 1 to Length(S) do
    if (S[I] < '0') or (S[I] > '9') then Result := False;
end;

function NextButtonClick(PageID: Integer): Boolean;
begin
  Result := True;
  if PageID = PgDados.ID then begin
    if (Trim(PgDados.Values[0]) = '') or (Trim(PgDados.Values[1]) = '') or (not PinValido(PgDados.Values[2])) then begin
      MsgBox('Preencha wsId, pasta de worklists e um PIN de 6 digitos (so numeros).', mbError, MB_OK);
      Result := False;
    end else if not DirExists(Trim(PgDados.Values[1])) then begin
      MsgBox('Pasta de worklists nao existe: ' + Trim(PgDados.Values[1]), mbError, MB_OK);
      Result := False;
    end;
  end;
  if (PageID = PgSa.ID) and (not FileExists(PgSa.Values[0])) then begin
    MsgBox('sa.json nao encontrado.', mbError, MB_OK);
    Result := False;
  end;
end;

function Json(const S: String): String;
begin
  Result := S;
  StringChangeEx(Result, '\', '\\', True);
  StringChangeEx(Result, '"', '\"', True);
end;

// icacls com checagem: falha vira MsgBox (a instalacao segue; o operador le a mensagem)
procedure Icacls(const Alvo, Args: String);
var R: Integer;
begin
  if not (Exec('icacls.exe', '"' + Alvo + '" ' + Args, '', SW_HIDE, ewWaitUntilTerminated, R) and (R = 0)) then
    MsgBox('icacls falhou em ' + Alvo + ' (codigo ' + IntToStr(R) + '). Corrija a permissao a mao.', mbError, MB_OK);
end;

procedure EscreverConfig;
var
  SaDest, Wl, Agent, J: String;
begin
  SaDest := ExpandConstant('{commonappdata}\Wader\sa.json');
  Wl := Trim(PgDados.Values[1]);
  Agent := Lowercase(GetComputerNameString) + '-' + IntToStr(1000 + Random(9000));
  if not CopyFile(PgSa.Values[0], SaDest, False) then
    MsgBox('Nao consegui copiar o sa.json para ' + SaDest + '. Copie a mao.', mbError, MB_OK);
  // sa.json: so Administrators, SYSTEM e NetworkService (SIDs: Windows pt-BR traduz nomes)
  Icacls(SaDest, '/inheritance:r /grant:r *S-1-5-32-544:F *S-1-5-18:F *S-1-5-20:R');
  // pasta de worklists do Orthanc: NetworkService precisa escrever .wl
  Icacls(Wl, '/grant *S-1-5-20:(OI)(CI)M');
  J := '{' + #13#10 +
    '  "version": "1.0",' + #13#10 +
    '  "wsId": "' + Json(Trim(PgDados.Values[0])) + '",' + #13#10 +
    '  "agentId": "' + Agent + '",' + #13#10 +
    '  "adminPin": "' + PgDados.Values[2] + '",' + #13#10 +
    '  "firebase": { "serviceAccountPath": "' + Json(SaDest) + '", "projectId": "leo-sistema-laudos" },' + #13#10 +
    '  "orthanc": { "worklistPath": "' + Json(Wl) + '" },' + #13#10 +
    '  "ui": { "port": 8043 }' + #13#10 +
    '}' + #13#10;
  if not SaveStringToFile(ConfigPath, J, False) then
    MsgBox('Nao consegui gravar ' + ConfigPath + '.', mbError, MB_OK);
end;

// BeforeInstall do "start" em [Run]: config + ACL tem que existir antes do servico subir.
procedure PrepararDados;
begin
  // Toda instalacao: corta heranca de ProgramData (Users nao cria arquivo aqui; senao
  // planta updates\wader-vX.exe + pedido.json e roda como NetworkService).
  Icacls(ExpandConstant('{commonappdata}\Wader'), '/inheritance:r /grant:r *S-1-5-32-544:(OI)(CI)F *S-1-5-18:(OI)(CI)F *S-1-5-20:(OI)(CI)M');
  // {app}: o lancador troca wader.exe <-> wader.exe.prev (sem cortar heranca de Program Files)
  Icacls(ExpandConstant('{app}'), '/grant *S-1-5-20:(OI)(CI)M');
  if Primeira then EscreverConfig;
end;
