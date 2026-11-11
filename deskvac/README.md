# DeskVac – robot-odkurzacz pulpitu Windows 11

**Autor:** VERME Paweł Robak · pawelrobak@outlook.com · tel. 504 706 334

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
  pulpit (Win+D, kliknięcie w pulpit), wychodzi na wierzch. Kliknięcie robota otwiera panel,
  **potrójne kliknięcie od razu uruchamia sprzątanie**, a prawy przycisk pokazuje menu.
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

Trzy sposoby, wszystkie działają od razu:
- **Przeciągnij ikony z pulpitu** na pole „🛡 Chronione” w panelu albo na listę w Ustawieniach
  (plik zostaje na miejscu – zapisywana jest tylko ścieżka).
- **Prawy przycisk** na ikonie → **Pokaż więcej opcji** → **Nie odkurzaj!**. Przy chronionej ikonie
  w tym miejscu pojawia się **Pozwól odkurzać!**. Działa dla wielu zaznaczonych ikon naraz.
- **Ustawienia → Chronione elementy**: lista z ikonami, „Dodaj plik/folder…”, „Pozwól odkurzać zaznaczone” (lub klawisz Delete).

Chronione ikony robot omija, a przy skanie lidarem dostają złotą tarczę.
Pozycje są w klasycznym menu (Windows 11 dopuszcza do skróconego menu tylko podpisane pakiety MSIX).

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

## Sprzątanie innych folderów (np. Pobrane)

W **Ustawieniach → Sprzątane foldery** jest lista folderów (domyślnie **Pobrane**; przyciski *+ Dokumenty,
+ Obrazy, + Inny folder…*). Robot porządkuje je **na miejscu**:

```
Pobrane\
├─ PDF\Faktury\  PDF\Umowy\  Word\…  Excel\…  Instalatory\  Archiwa\  Zdjęcia\Zrzuty ekranu\ …
├─ Foldery\      ← luźne podfoldery (np. rozpakowane archiwa)
├─ Niedokończone pobrania\  ← porzucone .part/.crdownload (nieruszane od 7 dni)
└─ (już istniejące foldery kategorii zostają na miejscu)
```

Zasady bezpieczeństwa (dla każdego folderu osobno):
- pomija pliki młodsze niż ustawiony wiek (Pobrane: domyślnie **1 dzień**, do zmiany w godzinach/dniach),
- zawsze pomija niedokończone pobierania (`.crdownload`, `.part`, `.tmp`…), pliki ukryte/systemowe,
  pliki otwarte w programach i elementy chronione („Nie odkurzaj!” działa też w tych folderach),
- przed **pierwszym** sprzątaniem folderu pokazuje **podgląd** („plik → dokąd trafi”) do zatwierdzenia;
  sprzątanie automatyczne bez zatwierdzonego podglądu pomija folder i prosi o podgląd powiadomieniem,
- nie sprząta folderów systemowych (dysk, Windows, Program Files, profil, AppData),
- **„Cofnij”** cofa cały ostatni wyjazd robota – pulpit i foldery razem.

**Harmonogram:** Pobrane – *wspólny z pulpitem* albo *własny*; inne foldery – zawsze własny:
tylko ręcznie / przypomnienie / sprzątanie automatyczne o wybranej godzinie i w wybrane dni.

**Uruchamianie:** w panelu lista **Co sprzątać** (Wszystko / Tylko pulpit / Tylko folder…), menu ikony
w zasobniku i robota (*Sprzątaj wszystko / pulpit / „Pobrane”*), potrójne kliknięcie w robota (pulpit
+ foldery „razem z pulpitem”, do wyłączenia), powiadomienia oraz **prawy przycisk na folderze**:
*DeskVac: Posprzątaj ten folder* (jednorazowo, z podglądem) i *DeskVac: Sprzątaj ten folder regularnie*.

**Animacja:** przy stacji pojawia się duża ikona folderu z licznikiem; robot podjeżdża, pliki wyskakują
z folderu i są zasysane z podpisem „→ PDF / Faktury”. Przy setkach plików animowana jest część,
licznik pokazuje wszystkie.

## Porządkowanie zebranych

Zebrane elementy trafiają do folderów **wg typu**, a dokumenty dodatkowo **wg tematu z nazwy pliku**:

```
Zebrane z pulpitu\
├─ Skróty programów, Skróty do folderów, Skróty do dokumentów, Skróty internetowe
├─ Word\Umowy, Word\Faktury, Word\Oferty…   Excel\…   PowerPoint\…   PDF\…   Teksty\…
├─ Zdjęcia (\Zrzuty ekranu, \Skany)   Filmy   Muzyka   Archiwa   Instalatory   E-maile
├─ Grafika i projekty   CAD   Kod   Pulpit zdalny (RDP)   Bazy danych   Czcionki
└─ Foldery   Inne
```

Tematy: Umowy, Faktury, Oferty, Zamówienia, Protokoły, Raporty, Cenniki, Instrukcje, CV, Certyfikaty,
Wnioski i pisma, Podatki, Wyciągi bankowe, Zrzuty ekranu, Skany. Słowa są rozpoznawane bez względu na
polskie znaki, odmianę i język (PL, EN, DE, FR, ES, IT, CZ/SK, NL, HU, TR, RU/UA) – np. *umowa, umowie,
contract, agreement, Vertrag, contrat, contrato, договор* → **Umowy**. Skróty `.lnk` są dzielone wg tego,
na co wskazują. Nazwa kategorii pojawia się pod ikoną w animacji zasysania, a po sprzątaniu – podsumowanie
(np. „PDF 3 · Word 2 · Zdjęcia 5”).

W Ustawieniach → *Porządkowanie zebranych* można wyłączyć podział (wtedy jak dawniej: folder z datą)
i jednym przyciskiem posortować wcześniej zebrane foldery z datami. „Cofnij” działa także po sortowaniu.

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

## Co sprzątać

Lista w panelu, menu zasobnika i potrójne kliknięcie w robota używają tych samych opcji:
**Tylko pulpit** (domyślnie) · Tylko folder Pobrane · Wybrane foldery dodatkowe · Pulpit i Pobrane ·
Wszystko (pulpit + Pobrane + foldery) · oraz pod kreską pojedyncze foldery dodatkowe.
Domyślną opcję zmienisz w Ustawieniach → Ogólne → *Domyślnie sprzątaj*.

Identyczne kopie plików (ta sama zawartość) trafiają **obok oryginału**, do tego samego folderu kategorii,
z własną nazwą. Osobny folder „Duplikaty” można włączyć w ustawieniach folderu; stary folder „Duplikaty”
segregacja rozkłada do właściwych folderów. Folder „Zebrane z pulpitu” ma własną ikonę stacji dokującej
(ukryte `desktop.ini` + `DeskVac.ico` w środku – zostaje także po odinstalowaniu).

## Testy automatyczne

`deskvac/DeskVac.Tests` (xUnit) – uruchamiane w GitHub Actions na Windows **przed** zbudowaniem instalatora;
gdy któryś test nie przejdzie, instalator nie powstaje. Obejmują m.in. reguły nazw, klasyfikator treści,
odczyt Word/PDF, ochronę przed XXE, porzucone pobrania, świeże pliki, kopie obok oryginałów, segregację
z cofaniem, ikonę folderu, opcje „Co sprzątać” i odporność „Cofnij” na zmieniony dziennik.

## Segregacja według treści (beta, od 2.0)

Drugi etap po sprzątaniu: robot **czyta treść** dokumentów już posortowanych wg typu (w „Zebrane z pulpitu”
i w sprzątanych folderach) i przenosi je do podfolderów tematycznych – np. `PDF\Faktury`, `PDF\Umowy`,
`PDF\Wyciągi bankowe`, `Word\Instrukcje`. Poprawia też wcześniejsze pomyłki typu (np. `.apk` w „Inne”).

- **Wszystko lokalnie, bez internetu i bez AI:** PDF – PdfPig (warstwa tekstowa), Word/Excel/PowerPoint/OpenDocument –
  bezpośrednio z XML (bez Office, bez makr), skany PDF i (opcjonalnie) zdjęcia – OCR wbudowany w Windows.
- **Klasyfikator punktowy:** charakterystyczne zwroty i wzorce (np. „Faktura VAT”, „Do zapłaty”, NIP → Faktury;
  „zawarta w dniu”, „§ 1”, „zwanym dalej” → Umowy; „Saldo początkowe/końcowe” → Wyciągi bankowe), także po angielsku
  i niemiecku. **Niepewny wynik = plik zostaje na miejscu.** Skan bez rozpoznanego tematu → `PDF\Skany`.
- **Bezpieczeństwo:** pliki czyta osobny proces z limitem 30 s na plik (uszkodzony plik nie zawiesi DeskVac),
  pierwsze 3 strony, pliki do 30 MB, XML bez DTD/encji zewnętrznych, limit rozmiaru w archiwach.
- **Podgląd** przy pierwszej segregacji (plik, było, będzie, dlaczego), potem w tle automatycznie po każdym
  sprzątaniu. „Cofnij” cofa sprzątanie i segregację razem. Pasek postępu „Segregacja” w panelu.
- Ustawienia → *Segregacja według treści*: włącz/wyłącz, automatycznie po sprzątaniu, OCR skanów, zdjęcia,
  „Segreguj ponownie wszystko (z podglądem)”.

## Pojemnik i cykle sprzątania pulpitu

Pojemnik robota mieści **30 elementów z pulpitu** (Ustawienia → Ogólne, 10–100). Gdy się zapełni, a na
pulpicie coś jeszcze leży, robot wraca do stacji, stacja opróżnia pojemnik, robot ładuje się (~3 s)
i sprząta dalej od miejsca, w którym przerwał. Dotyczy tylko pulpitu – foldery (np. Pobrane) są
porządkowane bez przerw. „Cofnij” cofa cały wyjazd, niezależnie od liczby powrotów do bazy.

## Motywy

Ustawienia → Ogólne → **Motyw**: Ciemny (domyślny), Jasny albo Systemowy – zgodny z *Ustawienia Windows →
Personalizacja → Kolory → Tryb aplikacji* i przełączany na żywo. Robot i animacje na pulpicie wyglądają
tak samo w każdym motywie.

## Ustawienia

W panelu wybierasz, co zbierać (skróty, pliki, foldery), czy minimalizować okna na czas
sprzątania, dźwięki i ich głośność, oraz listę nazw lub pełnych ścieżek, których robot nie rusza. Ustawienia są zapisywane w
`%LOCALAPPDATA%\DeskVac\settings.json`.

Robot zbiera wyłącznie elementy, które naprawdę leżą w folderze pulpitu (własnym lub publicznym).
**Nigdy nie przenosi folderów znanych Windows** (Pobrane, Dokumenty, Obrazy, Zrzuty ekranu, Z aparatu,
Muzyka, Wideo, OneDrive… – pełna lista z menedżera folderów Windows i rejestru), także gdy zostały
przeniesione na pulpit, ani folderów, które je zawierają. To samo dotyczy sprzątanych folderów.
Ikony systemowe – folder użytkownika (np. „Paweł Robak” = `C:\Users\…`), OneDrive, biblioteki, Kosz,
„Ten komputer”, Sieć, Panel sterowania – oraz sam folder „Zebrane z pulpitu” są pomijane automatycznie.

Gdy nie ma czego sprzątać (start ręczny lub automatyczny), robot pokazuje nad stacją chmurkę
„Twój Pulpit jest czysty! Nie mam nic do roboty! Gratulacje! 🙂”.

## Antywirusy i podpis cyfrowy

DeskVac nie zagląda do pamięci innych procesów (pozycje ikon czyta przez UI Automation – interfejs
ułatwień dostępu), nie używa Windows Script Host, nie rozpakowuje bibliotek do `%TEMP%` i ma pełne dane
wydawcy w pliku. Mimo to **niepodpisany** program od nowego wydawcy może zostać zablokowany przez
heurystyki (np. Norton 360). Rozwiązania:

1. **Zgłoszenie fałszywego alarmu** – bezpłatne, zwykle 1–3 dni robocze:
   Norton: <https://submit.norton.com/> („False positive”), Microsoft Defender:
   <https://www.microsoft.com/wdsi/filesubmission>. Po każdej nowej wersji najlepiej zgłosić ponownie.
2. **Podpis cyfrowy (certyfikat Code Signing)** – rozwiązanie docelowe. Workflow podpisuje `DeskVac.exe`
   i `DeskVac-Setup.exe` automatycznie, gdy w repozytorium są sekrety `SIGNING_PFX_BASE64` (plik .pfx
   zakodowany Base64) i `SIGNING_PFX_PASSWORD`. Uwaga: wielu wystawców wydaje dziś certyfikaty tylko na
   tokenie sprzętowym/w chmurze (bez pliku .pfx) – wtedy krok podpisu trzeba dostosować do ich narzędzia.
3. **Wyjątek w antywirusie** na własnym komputerze (np. Norton → Ustawienia → Antywirus → Wykluczenia).

## Znane ograniczenia

- Robot przejeżdża między monitorami po linii prostej; jeśli monitory nie stykają się krawędziami,
  przez chwilę jedzie „poza ekranem”.
- **Skróty z pulpitu publicznego** (`C:\Users\Public\Desktop`, np. instalowane dla wszystkich
  użytkowników) wymagają uprawnień administratora. Bez nich są pomijane i oznaczane czerwonym ×.
- Przy włączonym **Widok → Autorozmieszczanie ikon** ikony przesuwają się po każdym zebraniu.
  Robot to śledzi, ale przy cofaniu nie da się odtworzyć dawnych pozycji.
- Gdyby ramki namierzania były przesunięte, w Ustawieniach → Namierzanie ikon jest korekta X/Y
  i przycisk „Test namierzania”.
