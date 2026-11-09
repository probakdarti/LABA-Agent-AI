# DeskVac – robot-odkurzacz pulpitu Windows 11

Robot wyjeżdża ze stacji dokującej, skanuje pulpit lidarem, objeżdża ikony i „wsysa” skróty,
pliki oraz foldery do folderu **„Zebrane z pulpitu”**. Potem wraca do bazy i się ładuje.

**Nic nie jest usuwane.** Każde sprzątanie zapisuje dziennik i można je cofnąć przyciskiem
„Cofnij ostatnie”. Elementy wracają wtedy na pulpit, na swoje dawne miejsca.

## Instalacja

1. Na GitHubie wejdź w **Actions → „DeskVac – build Windows”**, otwórz najnowsze uruchomienie
   i pobierz artefakt **DeskVac-Setup** (zip z `DeskVac-Setup.exe`).
2. Uruchom `DeskVac-Setup.exe`. Instalacja nie wymaga administratora; program trafia do
   `%LOCALAPPDATA%\Programs\DeskVac`, a skrót do menu Start. Pole „Uruchamiaj razem z Windows” jest do wyboru.
3. Instalator nie jest podpisany cyfrowo, więc SmartScreen może zapytać: *Więcej informacji → Uruchom mimo to*.
4. Odinstalowanie: *Ustawienia → Aplikacje → DeskVac*. Usuwa też autostart i pozycję z menu kontekstowego.
   Ustawienia i historia sprzątań zostają w `%LOCALAPPDATA%\DeskVac`.

Artefakt **DeskVac-portable-win-x64** to sam `DeskVac.exe` bez instalatora.

### Z kodu źródłowego
Wymagany Windows 10/11 i [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0):
```powershell
cd deskvac/DeskVac
dotnet run -c Release
```

## Działanie w tle

- **Zasobnik systemowy**: ikona DeskVac obok zegara. Lewy klik otwiera panel, prawy klik pokazuje menu
  (Sprzątaj teraz, Ustawienia, Cofnij, Zakończ). Zamknięcie panelu krzyżykiem chowa go do zasobnika.
- **Robot przy stacji** stoi w prawym dolnym rogu monitora głównego, pod oknami programów. Gdy pokażesz
  pulpit (Win+D, kliknięcie w pulpit), wychodzi na wierzch. Kliknięcie robota otwiera panel.
- **Wszystkie monitory**: robot skanuje i sprząta ikony na każdym monitorze (tryb „Rozszerz te ekrany”),
  także przy różnym skalowaniu (np. 100% i 150%). Pozycje ikon są odczytywane wprost z Eksploratora.
- **Jedna kopia programu**: kolejne uruchomienia (skrót, menu kontekstowe, powiadomienie) trafiają do już działającej.

## Przypomnienia i sprzątanie automatyczne

W **Ustawieniach**:
- przypomnienie **po uruchomieniu komputera** (z opóźnieniem) i **codziennie o wybranych godzinach**
  (lista godzin, dni tygodnia), tylko gdy na pulpicie jest co najmniej N elementów;
- powiadomienie ma przyciski **Posprzątaj teraz / Za godzinę / Nie dziś**;
- **sprzątanie automatyczne bez pytania** o wybranej godzinie: robot jeździ pod oknami programów,
  nie zabiera fokusu, nie minimalizuje okien, opcjonalnie bez dźwięku. Powiadomienia „ruszył”
  (przycisk Zatrzymaj) i „skończył” (Otwórz folder / Cofnij). Przy prezentacji, grze lub filmie
  na pełnym ekranie sprzątanie czeka. Przegapioną godzinę (uśpiony komputer) nadrabia do 60 min.

## „Nie odkurzaj!”

Prawy przycisk na ikonie pulpitu → **Pokaż więcej opcji** → **DeskVac: Nie odkurzaj! / Pozwól odkurzać**.
Działa dla wielu zaznaczonych ikon naraz (jeszcze raz = zdejmuje ochronę). Chronione ikony robot omija,
a przy skanie lidarem dostają złotą tarczę. Listą chronionych zarządzasz też w Ustawieniach.

Pozycja jest w klasycznym menu (Windows 11 dopuszcza do skróconego menu tylko podpisane pakiety MSIX).

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

## Znane ograniczenia

- Robot przejeżdża między monitorami po linii prostej; jeśli monitory nie stykają się krawędziami,
  przez chwilę jedzie „poza ekranem”.
- **Skróty z pulpitu publicznego** (`C:\Users\Public\Desktop`, np. instalowane dla wszystkich
  użytkowników) wymagają uprawnień administratora. Bez nich są pomijane i oznaczane czerwonym ×.
- Przy włączonym **Widok → Autorozmieszczanie ikon** ikony przesuwają się po każdym zebraniu.
  Robot to śledzi, ale przy cofaniu nie da się odtworzyć dawnych pozycji.
- Gdyby ramki namierzania były przesunięte, w Ustawieniach → Namierzanie ikon jest korekta X/Y
  i przycisk „Test namierzania”.
