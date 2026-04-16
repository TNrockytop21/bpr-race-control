; BPR Race Control - SimHub Plugin Installer
; Copies BPRRaceControl.dll into the SimHub installation directory

#define MyAppName "BPR Race Control - SimHub Plugin"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Bite Point Racing"
#define MyAppURL "https://github.com/TNrockytop21/bpr-race-control"

[Setup]
AppId={{B1T3P01NT-BPR-SIMHUB-PLG-2026}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName={code:GetSimHubDir}
DisableDirPage=no
DirExistsWarning=no
OutputDir=output
OutputBaseFilename=BPR-RaceControl-SimHub-Plugin-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
DisableProgramGroupPage=yes
PrivilegesRequired=admin
CreateAppDir=no
Uninstallable=yes
UninstallFilesDir={code:GetSimHubDir}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\plugins\simhub\BPRRaceControl\bin\Release\net48\BPRRaceControl.dll"; DestDir: "{code:GetSimHubDir}"; Flags: ignoreversion

[Messages]
WelcomeLabel2=This will install the BPR Race Control plugin for SimHub.%n%nThe plugin streams your iRacing telemetry to the BPR Race Control server for live stewarding, and displays penalty notifications in-game.%n%nSimHub must be installed before running this installer.%n%nIf SimHub is currently running, please close it first.
FinishedLabel=The BPR Race Control plugin has been installed.%n%nTo use:%n  1. Launch SimHub%n  2. Enable "BPR Race Control" when prompted%n  3. Open the plugin settings to configure the server URL%n  4. Start iRacing — the plugin auto-connects%n%nThe plugin will automatically check for updates.

[Run]
Filename: "{code:GetSimHubExe}"; Description: "Launch SimHub"; Flags: nowait postinstall skipifsilent unchecked

[Code]
var
  SimHubPath: string;
  ResultCode: Integer;

function GetSimHubDir(Param: string): string;
begin
  Result := SimHubPath;
end;

function GetSimHubExe(Param: string): string;
begin
  Result := SimHubPath + '\SimHubWPF.exe';
end;

function FindSimHub(): Boolean;
begin
  Result := False;
  SimHubPath := '';

  // Try common install locations
  if DirExists('C:\Program Files (x86)\SimHub') then
  begin
    SimHubPath := 'C:\Program Files (x86)\SimHub';
    Result := True;
    Exit;
  end;

  if DirExists('C:\Program Files\SimHub') then
  begin
    SimHubPath := 'C:\Program Files\SimHub';
    Result := True;
    Exit;
  end;

  if DirExists(ExpandConstant('{localappdata}\SimHub')) then
  begin
    SimHubPath := ExpandConstant('{localappdata}\SimHub');
    Result := True;
    Exit;
  end;
end;

function InitializeSetup(): Boolean;
begin
  if not FindSimHub() then
  begin
    MsgBox('SimHub installation not found.' + #13#10 + #13#10 +
           'Please install SimHub first, then run this installer again.' + #13#10 +
           'Download SimHub from: https://www.simhubdash.com',
           mbError, MB_OK);
    Result := False;
    Exit;
  end;

  Result := True;
end;
