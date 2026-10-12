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
; (O icacls em CurStepChanged corta a heranca -- Users nao pode plantar updates\.)
Name: "{commonappdata}\Wader";         Permissions: admins-full networkservice-modify
Name: "{commonappdata}\Wader\updates"
Name: "{commonappdata}\Wader\logs"

[Run]
; O "stop" da atualizacao por cima fica em PrepareToInstall (antes de copiar arquivos).
Filename: "{app}\wader-service.exe"; Parameters: "install"; Flags: runhidden waituntilterminated; Check: not ServicoExiste
Filename: "{app}\wader-service.exe"; Parameters: "start";   Flags: runhidden waituntilterminated
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\registrar-aviso.ps1"" -Instalar ""{app}\wader-aviso.ps1"""; Flags: runhidden waituntilterminated

[UninstallRun]
Filename: "{app}\wader-service.exe"; Parameters: "stop";      Flags: runhidden waituntilterminated; RunOnceId: "parar"
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
    Exec(ExpandConstant('{app}\wader-service.exe'), 'stop', '', SW_HIDE, ewWaitUntilTerminated, R);
    Sleep(2000);
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

function NextButtonClick(PageID: Integer): Boolean;
begin
  Result := True;
  if PageID = PgDados.ID then
    if (Trim(PgDados.Values[0]) = '') or (Trim(PgDados.Values[1]) = '') or (Length(PgDados.Values[2]) <> 6) then begin
      MsgBox('Preencha wsId, pasta de worklists e um PIN de 6 digitos.', mbError, MB_OK);
      Result := False;
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

procedure EscreverConfig;
var
  SaDest, Wl, Agent, J: String;
  R: Integer;
begin
  SaDest := ExpandConstant('{commonappdata}\Wader\sa.json');
  Wl := Trim(PgDados.Values[1]);
  Agent := Lowercase(GetComputerNameString) + '-' + IntToStr(1000 + Random(9000));
  FileCopy(PgSa.Values[0], SaDest, False);
  // sa.json: so Administrators, SYSTEM e NetworkService (SIDs: Windows pt-BR traduz nomes)
  Exec('icacls.exe', '"' + SaDest + '" /inheritance:r /grant:r *S-1-5-32-544:F *S-1-5-18:F *S-1-5-20:R', '', SW_HIDE, ewWaitUntilTerminated, R);
  // pasta de worklists do Orthanc: NetworkService precisa escrever .wl
  Exec('icacls.exe', '"' + Wl + '" /grant *S-1-5-20:(OI)(CI)M', '', SW_HIDE, ewWaitUntilTerminated, R);
  J := '{' + #13#10 +
    '  "version": "1.0",' + #13#10 +
    '  "wsId": "' + Json(Trim(PgDados.Values[0])) + '",' + #13#10 +
    '  "agentId": "' + Agent + '",' + #13#10 +
    '  "adminPin": "' + PgDados.Values[2] + '",' + #13#10 +
    '  "firebase": { "serviceAccountPath": "' + Json(SaDest) + '", "projectId": "leo-sistema-laudos" },' + #13#10 +
    '  "orthanc": { "worklistPath": "' + Json(Wl) + '" },' + #13#10 +
    '  "ui": { "port": 8043 }' + #13#10 +
    '}' + #13#10;
  SaveStringToFile(ConfigPath, J, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var R: Integer;
begin
  if CurStep = ssPostInstall then begin
    // Toda instalacao: corta heranca de ProgramData (Users nao cria arquivo aqui; senao
    // planta updates\wader-vX.exe + pedido.json e roda como NetworkService).
    Exec('icacls.exe', '"' + ExpandConstant('{commonappdata}\Wader') + '" /inheritance:r /grant:r *S-1-5-32-544:(OI)(CI)F *S-1-5-18:(OI)(CI)F *S-1-5-20:(OI)(CI)M', '', SW_HIDE, ewWaitUntilTerminated, R);
    if Primeira then EscreverConfig;
  end;
end;
