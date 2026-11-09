; Instalator DeskVac (Inno Setup 6). Budowany w GitHub Actions:
;   ISCC.exe /DAppVersion=0.2.0 deskvac\installer\DeskVac.iss
; Instaluje dla bieżącego użytkownika (bez uprawnień administratora).

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{6F3C2A51-8B7E-4C9D-9A41-2B5E7D0C1F88}
AppName=DeskVac
AppVerName=DeskVac {#AppVersion}
AppVersion={#AppVersion}
AppPublisher=DeskVac
VersionInfoVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\DeskVac
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
OutputDir=..\..\out
OutputBaseFilename=DeskVac-Setup
SetupIconFile=..\DeskVac\Assets\DeskVac.ico
UninstallDisplayIcon={app}\DeskVac.exe
UninstallDisplayName=DeskVac – robot-odkurzacz pulpitu
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes
CloseApplications=force
RestartApplications=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "pl"; MessagesFile: "compiler:Languages\Polish.isl"

[Tasks]
Name: "autostart"; Description: "Uruchamiaj DeskVac razem z Windows (robot czeka przy stacji, przypomnienia o sprzątaniu)"; GroupDescription: "Dodatkowo:"

[Files]
Source: "..\..\out\DeskVac.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{userprograms}\DeskVac"; Filename: "{app}\DeskVac.exe"; Comment: "Robot-odkurzacz pulpitu"

[Registry]
; autostart – tylko gdy zaznaczono zadanie; program potem sam pilnuje ścieżki
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "DeskVac"; \
  ValueData: """{app}\DeskVac.exe"" --tray"; Tasks: autostart; Flags: uninsdeletevalue
; pozycję „Nie odkurzaj!” rejestruje sam program; tu tylko gwarancja usunięcia przy deinstalacji
Root: HKCU; Subkey: "Software\Classes\AllFilesystemObjects\shell\DeskVac.Protect"; Flags: uninsdeletekey dontcreatekey
Root: HKCU; Subkey: "Software\Classes\AllFilesystemObjects\shell\DeskVac.NoVacuum"; Flags: uninsdeletekey dontcreatekey
Root: HKCU; Subkey: "Software\Classes\AllFilesystemObjects\shell\DeskVac.AllowVacuum"; Flags: uninsdeletekey dontcreatekey
Root: HKCU; Subkey: "Software\Classes\Directory\shell\DeskVac.CleanFolder"; Flags: uninsdeletekey dontcreatekey
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\DeskVac.CleanFolder"; Flags: uninsdeletekey dontcreatekey
Root: HKCU; Subkey: "Software\Classes\Directory\shell\DeskVac.AddFolder"; Flags: uninsdeletekey dontcreatekey
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\DeskVac.AddFolder"; Flags: uninsdeletekey dontcreatekey

[Run]
Filename: "{app}\DeskVac.exe"; Description: "Uruchom DeskVac"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; zamyka działającą kopię i usuwa wpisy z rejestru (autostart, menu kontekstowe, powiadomienia)
Filename: "{app}\DeskVac.exe"; Parameters: "--cleanup"; Flags: runhidden waituntilterminated; RunOnceId: "DeskVacCleanup"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
