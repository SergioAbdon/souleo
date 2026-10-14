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

[InstallDelete]
; Setup e a ancora zero do estado do lancador: nada de .prev nem bilhete velho sobrevive.
Type: files; Name: "{app}\bin\wader.exe.prev"
Type: files; Name: "{app}\wader.exe.prev"
Type: files; Name: "{app}\wader.exe"
Type: files; Name: "{commonappdata}\Wader\updates\lancador.json"
Type: files; Name: "{commonappdata}\Wader\updates\pedido.json"

[Files]
; So bin\ e gravavel pelo servico (o lancador troca wader.exe <-> .prev ali).
; O resto de {app} (lancador, WinSW, scripts que o desinstalador roda elevado) fica so-admin.
Source: "..\build\wader.exe";         DestDir: "{app}\bin"; Flags: ignoreversion
Source: "..\build\wader-service.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "wader-service.xml";          DestDir: "{app}"; Flags: ignoreversion
Source: "wader-launch.ps1";           DestDir: "{app}"; Flags: ignoreversion
Source: "wader-aviso.ps1";            DestDir: "{app}"; Flags: ignoreversion
Source: "registrar-aviso.ps1";        DestDir: "{app}"; Flags: ignoreversion

[Dirs]
; Dados sobrevivem a desinstalar/reinstalar. ACL fechada em PrepararDados (ssInstall).
Name: "{commonappdata}\Wader";         Permissions: admins-full networkservice-modify
Name: "{commonappdata}\Wader\updates"
Name: "{commonappdata}\Wader\logs"
Name: "{app}\bin"; Permissions: networkservice-modify

[Run]
; O "stopwait" da atualizacao por cima fica em PrepareToInstall (antes de copiar arquivos).
; Config + ACL de ProgramData ficam em CurStepChanged(ssInstall); se falharam, o servico NAO sobe.
Filename: "{app}\wader-service.exe"; Parameters: "install"; Flags: runhidden waituntilterminated; Check: DadosOk and not ServicoExiste
Filename: "{app}\wader-service.exe"; Parameters: "start";   Flags: runhidden waituntilterminated; Check: DadosOk; BeforeInstall: AclBin
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\registrar-aviso.ps1"" -Instalar ""{app}\wader-aviso.ps1"""; Flags: runhidden waituntilterminated

[UninstallRun]
Filename: "{app}\wader-service.exe"; Parameters: "stopwait";  Flags: runhidden waituntilterminated; RunOnceId: "parar"
Filename: "{app}\wader-service.exe"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "desinstalar"
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\registrar-aviso.ps1"" -Remover"; Flags: runhidden waituntilterminated; RunOnceId: "aviso"

[UninstallDelete]
Type: files; Name: "{app}\bin\wader.exe.prev"
Type: files; Name: "{app}\bin\wader.exe.tmp"

[Code]
var
  PgDados: TInputQueryWizardPage;
  PgSa: TInputFileWizardPage;
  Primeira: Boolean;
  DadosProntos: Boolean;

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

// Check do "start": dados/ACL/config prontos em ssInstall
function DadosOk: Boolean;
begin
  Result := DadosProntos;
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

// icacls com checagem: devolve False e mostra o que falhou
function Icacls(const Alvo, Args: String): Boolean;
var R: Integer;
begin
  Result := Exec('icacls.exe', '"' + Alvo + '" ' + Args, '', SW_HIDE, ewWaitUntilTerminated, R) and (R = 0);
  if not Result then
    MsgBox('icacls falhou em ' + Alvo + ' (' + Args + '; codigo ' + IntToStr(R) + ').', mbError, MB_OK);
end;

function EscreverConfig: Boolean;
var
  SaDest, Wl, Agent, J: String;
  Linhas: TArrayOfString;
begin
  SaDest := ExpandConstant('{commonappdata}\Wader\sa.json');
  Wl := RemoveBackslashUnlessRoot(Trim(PgDados.Values[1]));
  Agent := Lowercase(GetComputerNameString) + '-' + IntToStr(1000 + Random(9000));
  Result := CopyFile(PgSa.Values[0], SaDest, False);
  if not Result then begin
    MsgBox('Nao consegui copiar o sa.json para ' + SaDest + '.', mbError, MB_OK);
    Exit;
  end;
  // pasta de worklists do Orthanc: NetworkService precisa escrever .wl
  Result := Icacls(Wl, '/grant *S-1-5-20:(OI)(CI)M');
  if not Result then Exit;
  J := '{' + #13#10 +
    '  "version": "1.0",' + #13#10 +
    '  "wsId": "' + Json(Trim(PgDados.Values[0])) + '",' + #13#10 +
    '  "agentId": "' + Agent + '",' + #13#10 +
    '  "adminPin": "' + PgDados.Values[2] + '",' + #13#10 +
    '  "firebase": { "serviceAccountPath": "' + Json(SaDest) + '", "projectId": "leo-sistema-laudos" },' + #13#10 +
    '  "orthanc": { "worklistPath": "' + Json(Wl) + '" },' + #13#10 +
    '  "ui": { "port": 8043 }' + #13#10 +
    '}';
  SetArrayLength(Linhas, 1);
  Linhas[0] := J;
  // UTF-8 (wsId/caminho podem ter acento); o loadConfig tira o BOM
  Result := SaveStringsToUTF8File(ConfigPath, Linhas, False);
  if not Result then
    MsgBox('Nao consegui gravar ' + ConfigPath + '.', mbError, MB_OK);
end;

// ssInstall (antes de [Files]): pastas, ACL fechada de ProgramData, config e sa.json.
// Qualquer falha -> DadosProntos=False -> o "start" do [Run] e pulado.
procedure PrepararDados;
var D, Sa: String;
begin
  D := ExpandConstant('{commonappdata}\Wader');
  Sa := D + '\sa.json';
  DadosProntos := ForceDirectories(D + '\updates') and ForceDirectories(D + '\logs');
  if not DadosProntos then MsgBox('Nao consegui criar ' + D + '.', mbError, MB_OK);
  // Usuarios por padrao criam arquivo em ProgramData: poderiam plantar updates\wader-vX.exe
  // + pedido.json (rodaria como NetworkService). /grant:r nao tira ACE explicita de outro SID
  // nem troca o dono -> setowner + reset antes de cortar a heranca.
  // Sem /C de proposito: com /C o icacls devolve 0 mesmo falhando (provado 12/10).
  if DadosProntos then DadosProntos := Icacls(D, '/setowner *S-1-5-32-544 /T /Q');
  if DadosProntos then DadosProntos := Icacls(D, '/reset /T /Q');
  if DadosProntos then DadosProntos := Icacls(D, '/inheritance:r /grant:r *S-1-5-32-544:(OI)(CI)F *S-1-5-18:(OI)(CI)F *S-1-5-20:(OI)(CI)M');
  if DadosProntos and Primeira then DadosProntos := EscreverConfig;
  // sa.json: so Administrators, SYSTEM e NetworkService leitura (toda instalacao: o /reset acima o abriu)
  if DadosProntos and FileExists(Sa) then
    DadosProntos := Icacls(Sa, '/inheritance:r /grant:r *S-1-5-32-544:F *S-1-5-18:F *S-1-5-20:R');
  if not DadosProntos then
    MsgBox('O servico Wader NAO foi iniciado: a preparacao de ' + D + ' falhou (mensagem anterior). ' +
      'Corrija e rode o Setup de novo.', mbError, MB_OK);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then PrepararDados;
end;

// BeforeInstall do "start": bin\ existe depois de [Files]. So ali NetworkService escreve.
procedure AclBin;
var R: Integer;
begin
  // layout antigo dava M ao NetworkService em {app} inteiro: tira. Codigo ignorado (a ACE pode nem existir).
  Exec('icacls.exe', '"' + ExpandConstant('{app}') + '" /remove:g *S-1-5-20', '', SW_HIDE, ewWaitUntilTerminated, R);
  Icacls(ExpandConstant('{app}\bin'), '/grant *S-1-5-20:(OI)(CI)M');
end;
