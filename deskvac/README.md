# DeskVac – robot-odkurzacz pulpitu Windows 11

Robot wyjeżdża ze stacji dokującej, skanuje pulpit lidarem, objeżdża ikony i „wsysa” skróty,
pliki oraz foldery do folderu **„Zebrane z pulpitu”**. Potem wraca do bazy i się ładuje.

**Nic nie jest usuwane.** Każde sprzątanie zapisuje dziennik i można je cofnąć przyciskiem
„Cofnij ostatnie”. Elementy wracają wtedy na pulpit, na swoje dawne miejsca.

## Jak uruchomić

### Gotowy plik .exe (najprościej)
1. Na GitHubie wejdź w **Actions → „DeskVac – build Windows”**, otwórz ostatnie uruchomienie
   i pobierz artefakt **DeskVac-win-x64** (plik zip z `DeskVac.exe`).
2. Rozpakuj i uruchom `DeskVac.exe`. Nie trzeba instalować .NET.
   Plik nie jest podpisany cyfrowo, więc SmartScreen może zapytać: *Więcej informacji → Uruchom mimo to*.

### Z kodu źródłowego
Wymagany Windows 10/11 i [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0).

```powershell
cd deskvac/DeskVac
dotnet run -c Release
```

Albo otwórz `deskvac/DeskVac/DeskVac.csproj` w Visual Studio 2022 lub VS Code (C# Dev Kit).

## Jak to działa

| Element | Plik | Technika |
|---|---|---|
| Pozycje ikon pulpitu | `Native/DesktopView.cs` | `IShellWindows` → `IShellBrowser` → `IFolderView::GetItemPosition` (oficjalne API powłoki) |
| Ikony do animacji | `Native/DesktopView.cs` | systemowa lista obrazów `SHGetImageList(SHIL_EXTRALARGE)` |
| Nakładka, po której jeździ robot | `Overlay/OverlayWindow.cs` | przezroczyste okno WPF przepuszczające kliknięcia (`WS_EX_TRANSPARENT`) |
| Robot, lidar, zasysanie, cząsteczki | `Overlay/Stage.cs`, `Overlay/RobotPainter.cs` | rysowanie wektorowe w 60 FPS (`CompositionTarget.Rendering`) |
| Przenoszenie i cofanie | `Core/Collector.cs` | `File.Move` / `Directory.Move` + dziennik JSON w `%LOCALAPPDATA%\DeskVac\history` |
| Panel z mapą | `Panel/MainWindow.xaml`, `Panel/MiniMap.cs` | WPF, ciemny motyw |
| Spięcie wszystkiego | `CleaningController.cs` | |

Przebieg sprzątania: **wyjazd ze stacji → skan lidarem (wykrywanie ikon) → sprzątanie
(najbliższa ikona, robot zbiera też wszystko, przez co przejeżdża) → powrót → dokowanie i ładowanie.**

## Dźwięk

| Moment | Dźwięk |
|---|---|
| Start | krótki trójdźwięk, potem **rozruch silnika** |
| Skanowanie | szum obracającego się lidaru + „ping” przy każdej wykrytej ikonie |
| Odkurzanie | **silnik w pętli bez przerw** (z nagrania), panorama stereo podąża za robotem; „fwump” przy każdym zassanym elemencie |
| Pauza | silnik zwalnia do zera, po wznowieniu znów się rozpędza |
| Parkowanie | **wybieg silnika** podczas cofania na stację, potem klik styków i „du-dip” |
| Opróżnianie | stacja wysysa pojemnik (~4 s): silnik stacji, wir powietrza, grzechot drobin |
| Koniec | radosny dwudźwięk |

Dźwięki leżą w `DeskVac/Assets/Sounds` i są wkompilowane w `.exe`. Silnik pochodzi z nagrania,
które skrypt `tools/make_sounds.py` dzieli na rozruch, pętlę i wybieg. Pozostałe efekty skrypt
syntetyzuje. Żeby podmienić silnik na inne nagranie:

```powershell
pip install numpy
python deskvac/tools/make_sounds.py moje_nagranie.mp3 deskvac/DeskVac/Assets/Sounds
```

Skrypt zakłada nagranie ~10 s: rozruch do 1,3 s, równa praca do 7,9 s, potem wybieg.

## Ustawienia

W panelu wybierasz, co zbierać (skróty, pliki, foldery), czy minimalizować okna na czas
sprzątania, dźwięki i ich głośność, oraz listę nazw lub pełnych ścieżek, których robot nie rusza. Ustawienia są zapisywane w
`%LOCALAPPDATA%\DeskVac\settings.json`.

Robot zawsze pomija Kosz, „Ten komputer” i inne elementy wirtualne oraz sam folder „Zebrane z pulpitu”.

## Znane ograniczenia (prototyp 0.1)

- **Kilka monitorów o różnym skalowaniu DPI**: pozycje są liczone w skali monitora głównego,
  więc na monitorze o innym skalowaniu robot może celować obok ikon.
- **Skróty z pulpitu publicznego** (`C:\Users\Public\Desktop`, np. instalowane dla wszystkich
  użytkowników) wymagają uprawnień administratora. Bez nich są pomijane i oznaczane czerwonym ×.
- Przy włączonym **Widok → Autorozmieszczanie ikon** ikony przesuwają się po każdym zebraniu.
  Robot to śledzi, ale przy cofaniu nie da się odtworzyć dawnych pozycji.
- Pozycja ikony jest wyliczana z odstępów siatki pulpitu, więc może się różnić o kilka pikseli
  od miejsca, w którym Explorer faktycznie ją rysuje.
