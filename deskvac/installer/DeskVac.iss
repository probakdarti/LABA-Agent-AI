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
AppPublisher=VERME Paweł Robak
AppPublisherURL=mailto:pawelrobak@outlook.com
AppSupportURL=mailto:pawelrobak@outlook.com
AppContact=pawelrobak@outlook.com
AppSupportPhone=504 706 334
AppCopyright=© 2026 VERME Paweł Robak
VersionInfoVersion={#AppVersion}
VersionInfoCompany=VERME Paweł Robak
VersionInfoCopyright=© 2026 VERME Paweł Robak
VersionInfoDescription=Instalator DeskVac – robot-odkurzacz pulpitu
VersionInfoProductName=DeskVac
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
#ifdef Sign
; podpis instalatora i deinstalatora – polecenie podaje workflow: ISCC /DSign=1 "/Sdeskvacsign=signtool sign … $f"
SignTool=deskvacsign
SignedUninstaller=yes
#endif

[Languages]
Name: "pl"; MessagesFile: "compiler:Languages\Polish.isl"

[Tasks]
Name: "autostart"; Description: "Uruchamiaj DeskVac razem z Windows (robot czeka przy stacji, przypomnienia o sprzątaniu)"; GroupDescription: "Dodatkowo:"

[Messages]
pl.WelcomeLabel2=Ten kreator zainstaluje [name/ver] na Twoim komputerze.%n%nDeskVac to robot-odkurzacz, który porządkuje pulpit i wskazane foldery (np. Pobrane). Nic nie usuwa – każde sprzątanie można cofnąć.%n%nAutor: VERME Paweł Robak%ne-mail: pawelrobak@outlook.com%ntel. 504 706 334

[Files]
; cała aplikacja w folderze (bez rozpakowywania bibliotek do %TEMP% przy starcie – mniej podejrzane dla antywirusów)
Source: "..\..\out\app\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

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
