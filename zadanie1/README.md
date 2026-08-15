# Zadanie 1 — Modyfikacja chatbota + porównanie modeli

**Domena:** zarządzanie projektami (asystent PM)
**Autor:** Paweł Robak
**Chatbot:** [`chatbot.py`](chatbot.py)

---

## 1. Co zostało zrobione

Chatbot konsolowy w Pythonie z **instrukcją systemową dla domeny „zarządzanie projektami"** —
persona **VERMI — PM Assistant**: doświadczony Project Manager (Agile/Scrum, zarządzanie ryzykiem,
harmonogramowanie), który odpowiada w sztywnej 4-częściowej strukturze:

| Sekcja | Rola |
|---|---|
| 📋 **Kontekst** | potwierdzenie zrozumienia pytania (1 zdanie) |
| 🔍 **Analiza** | odpowiedź merytoryczna (max 2 akapity) |
| ✅ **Rekomendacja** | 1–3 konkretne działania |
| ❓ **Pytanie** | jedno pytanie pogłębiające |

Dodatkowe reguły w prompcie, które służą jako **kryteria oceny modeli**: oznaczanie pewności faktów
(`✓ pewne`, `~ przybliżone`, `? do weryfikacji`), wyjaśnianie terminów branżowych w nawiasie,
pamięć całej rozmowy, odmowa odpowiedzi spoza domeny PM.

To ten sam system prompt, co w webowej wersji projektu
([`app/api/chat/route.ts`](../app/api/chat/route.ts)) — dzięki temu wynik porównania jest decyzją
produkcyjną dla realnej aplikacji, a nie ćwiczeniem na sztucznym przykładzie.

### Uruchomienie

```bash
pip install -r requirements.txt
```

```bash
python chatbot.py
```

| Komenda | Działanie |
|---|---|
| `python chatbot.py` | tryb interaktywny (rozmowa z pamięcią) |
| `python chatbot.py --demo` | 3-turowa rozmowa demo (pod screenshot) |
| `python chatbot.py --demo 3` | to samo, ale na modelu nr 3 |
| `python chatbot.py --porownaj` | benchmark: 3 pytania × 3 modele |
| `python chatbot.py --modele` | lista modeli dostępnych dla Twojego klucza |

W trybie interaktywnym: `/model <nr>` (przełącza model **zachowując historię rozmowy**),
`/porownaj <pytanie>`, `/reset`, `/pomoc`, `/koniec`.

Klucz API czytany jest z `.env.local` projektu nadrzędnego (`GOOGLE_GENERATIVE_AI_API_KEY`) —
sekrety nie są duplikowane w tym katalogu.

### Obsługa 3 dostawców

Warstwa dostawców (`PROVIDERS` w [`chatbot.py`](chatbot.py)) obsługuje **Google, OpenAI i Anthropic**
— każdy zwraca ujednolicony obiekt `Odpowiedz` (tekst, czas, tokeny). Aby dorzucić dostawcę:
zainstaluj SDK (`pip install openai` / `anthropic`), dopisz klucz do `.env.local` i dodaj wpis
`ModelSpec(provider="openai", ...)` do listy `MODELS`.

**W tym porównaniu użyto 3 modeli Google**, ponieważ projekt dysponuje wyłącznie kluczem Google AI
Studio. Modele dobrano tak, by reprezentowały trzy różne półki wydajności — porównanie nie jest
„trzy razy to samo".

---

## 2. Metodyka porównania

- **Identyczny system prompt** dla wszystkich modeli, identyczne pytania, brak historii (każde
  pytanie w czystym kontekście) — mierzalne różnice pochodzą wyłącznie od modelu.
- **3 pytania testowe** o rosnącej złożoności, z domeny PM:
  1. *złożone, wymagające analizy* — „Wdrożenie ERP w firmie produkcyjnej, 40 osób, 9 miesięcy. Jakie są 3 największe ryzyka i jak je zmitygować?"
  2. *diagnostyczne* — „Zespół nie dowozi sprintów: commitment 40 SP, dowozimy 25. Od czego zacząć diagnozę?"
  3. *definicyjne* — „Czym różni się rejestr ryzyk od rejestru problemów?"
- **Osobny test pamięci** — 3-turowa rozmowa, gdzie trzecia tura („podsumuj, co ustaliliśmy")
  weryfikuje, czy model pamięta imię i oba wcześniejsze wątki.
- Surowe wyniki: [`wyniki_porownania.txt`](wyniki_porownania.txt),
  [`rozmowa_demo_model1.txt`](rozmowa_demo_model1.txt),
  [`rozmowa_demo_model2.txt`](rozmowa_demo_model2.txt),
  [`rozmowa_demo_model3.txt`](rozmowa_demo_model3.txt).

### Testowane modele

| # | Model | Rola w porównaniu |
|---|---|---|
| 1 | `gemini-2.5-flash-lite` | poprzednia generacja — punkt odniesienia |
| 2 | `gemini-3.1-flash-lite` | model produkcyjny aplikacji VERMI |
| 3 | `gemini-3.6-flash` | najmocniejszy dostępny na darmowym planie (z rozumowaniem) |

> Modele klasy Pro (`gemini-3.1-pro-preview`, `gemini-pro-latest`) mają na darmowym planie limit 0
> i zwracają błąd 429 — nie dało się ich włączyć do porównania bez płatnego konta.

---

## 3. Wyniki liczbowe

### Benchmark (3 pytania, czysty kontekst)

| Model | Czas śr. | Czas min–max | Tokeny wyjściowe śr. | Długość odpowiedzi śr. |
|---|---|---|---|---|
| Gemini 2.5 Flash Lite | **3,3 s** | 2,1–4,3 s | 655 | 2360 znaków |
| Gemini 3.1 Flash Lite | 4,0 s | 2,2–6,0 s | **513** | **1771 znaków** |
| Gemini 3.6 Flash | 23,1 s | 16,4–29,5 s | 496 | 1677 znaków |

Tokeny wejściowe identyczne dla wszystkich (583–609) — prompt systemowy jest ten sam.

### Test pamięci (rozmowa 3-turowa)

| Model | Czas śr./tura | Struktura 📋🔍✅❓ | Znaczniki pewności `✓`/`~` | Użycie imienia |
|---|---|---|---|---|
| Gemini 2.5 Flash Lite | 2,9 s | **0/3 tur** ❌ | 0 | 2× |
| Gemini 3.1 Flash Lite | 3,0 s | **3/3 tury** ✅ | 0 | 3× |
| Gemini 3.6 Flash | 11,3 s | **3/3 tury** ✅ | 2 | 7× |

Wszystkie trzy modele **poprawnie pamiętały** całą rozmowę — w turze 3 każdy odtworzył imię
(Paweł), temat ERP i problem 40 vs 25 SP. Pamięć nie różnicuje modeli; różnicuje je **dyscyplina
formatu**.

---

## 4. Analiza jakościowa

### Gemini 2.5 Flash Lite — najszybszy, ale nie trzyma się promptu

Najlepszy czas, ale **łamie instrukcję systemową w sposób dyskwalifikujący**:

- **Dokleja gadulstwo przed odpowiedzią** — „Jasne, chętnie pomogę!", „Cześć, Paweł! Miło mi Cię
  poznać." — mimo że prompt definiuje 📋 Kontekst jako pierwszy element.
- **Zgubił format w rozmowie wielotorowej** — w teście pamięci **żadna** z 3 tur nie miała
  wymaganych sekcji z emoji; zamiast nich pojawiły się własne nagłówki `### Kontekst` / `### Analiza`.
  W benchmarku (jedno pytanie, czysty kontekst) format się utrzymywał — czyli im dłuższa rozmowa,
  tym większy dryf.
- Raz **wyciekła mu nazwa persony jako nagłówek** dokumentu (`## VERMI — PM ASSISTANT`).
- **Najbardziej rozwlekły** — 970 tokenów przy pytaniu 1, przy limicie „max 3 akapity" z promptu.
  To o ~85% więcej niż model 3 przy tym samym pytaniu.
- **Zero znaczników pewności** `✓`/`~` w całym teście.
- Merytorycznie poprawny, ale **ogólnikowy** — ryzyka opisane książkowo, bez odniesienia do
  specyfiki produkcji.

### Gemini 3.1 Flash Lite — najlepszy stosunek jakości do kosztu

- **100% zgodności z formatem** — wszystkie sekcje, w każdej turze, bez preambuł.
- **Najzwięźlejszy przy pełnej treści** — 513 tokenów śr., 1771 znaków; mieści się w limicie akapitów.
- **Konsekwentnie tłumaczy żargon** zgodnie z promptem: *scope creep* („niekontrolowane zwiększanie
  wymagań"), *Definition of Ready*, *Change Control Board*, „shadow IT".
- Merytoryka konkretna i praktyczna — „ambasadorzy zmiany", audyt danych przed startem migracji,
  formalny komitet zmian.
- **Słabość:** znaczniki pewności `✓`/`~` stosuje **niekonsekwentnie** — w benchmarku 0 razy, choć w
  podsumowaniu rozmowy użył ich przy każdym ustaleniu. To jedyna reguła promptu, której nie trzyma
  stabilnie.

### Gemini 3.6 Flash — najwyższa jakość merytoryczna, ale wolny

- **Jedyny model konsekwentnie oznaczający pewność** — `✓ pewne` i `~ przybliżone` w benchmarku
  (1–3 wystąpienia na odpowiedź). Realizuje regułę promptu, którą pozostałe dwa ignorują.
- **Najgłębsza wiedza domenowa** — jako jedyny zszedł na poziom specyfiki produkcji: struktury **BOM**,
  karty technologiczne, dane master, indeksy magazynowe. Pozostałe modele zatrzymały się na
  ogólnym „ryzyko jakości danych".
- **Najlepsze przykłady dydaktyczne** — różnicę ryzyko/problem pokazał parą: *„Kluczowy programista
  może odejść"* vs *„Kluczowy programista podał się do dymisji"*.
- Najmocniej personalizuje — użył imienia 7× w 3 turach.
- **Zabójcza słabość: czas.** 23,1 s średnio w benchmarku (do 29,5 s), 11,3 s w rozmowie. To model
  z wewnętrznym rozumowaniem — płaci się za nie latencją. W czacie na żywo 30 s oczekiwania to
  porzucona sesja.

---

## 5. Werdykt — który model lepiej radzi sobie z moją domeną?

> **Do produkcji: `gemini-3.1-flash-lite`.**

Domena PM w interfejsie czatu nagradza **dyscyplinę formatu i responsywność**, nie maksymalną głębię.
Model 3.1 Flash Lite dostarcza 100% zgodności ze strukturą promptu przy ~3 s odpowiedzi i
najniższym zużyciu tokenów — a różnica merytoryczna wobec 3.6 Flash to niuanse (brak wzmianki o BOM),
nie błędy. Za tę różnicę płaciłoby się **7× dłuższym czasem odpowiedzi**.

**`gemini-2.5-flash-lite` odpada** mimo najlepszego czasu: model, który w rozmowie wielotorowej
przestaje trzymać zadaną strukturę i dokleja „Jasne, chętnie pomogę!", nie nadaje się do asystenta
opartego na sztywnej personie. To najważniejszy wniosek z zadania — **sama szybkość nic nie znaczy,
jeśli model nie wykonuje instrukcji systemowej**.

**`gemini-3.6-flash` ma zastosowanie niszowe** — tam, gdzie latencja nie boli: generowanie rejestru
ryzyk, analiza dokumentu przedwdrożeniowego, przygotowanie briefingu offline. Jego przewaga w
oznaczaniu pewności faktów (`✓`/`~`) jest realną wartością dla dokumentów, które ktoś podpisze.

### Wniosek wdrożeniowy

Wybór `gemini-3.1-flash-lite` w aplikacji webowej VERMI
([`app/api/model-router.ts`](../app/api/model-router.ts)) **potwierdza się pomiarem** — to nie była
tylko decyzja kosztowa. Uzasadniona zmiana: routing dwupoziomowy — 3.1 Flash Lite do czatu, 3.6 Flash
do zadań generujących dokumenty w tle.

---

## 6. Ograniczenia pomiaru

- Po jednym przebiegu na parę (model × pytanie) — czasy odpowiedzi API wahają się w zależności od
  obciążenia. Widać to na modelu 3.6 Flash: 16–29 s w benchmarku, ale 9–13 s w rozmowie demo. Wnioski
  o **rzędzie wielkości** różnicy (3 s vs 20 s) są odporne na tę zmienność; różnica 3,3 s vs 4,0 s
  między modelami 1 i 2 już nie — traktuję je jako równie szybkie.
- Ocena jakości merytorycznej jest ekspercka (moja), nie ślepa.
- Wszystkie modele od jednego dostawcy — porównanie mierzy różnice generacji i klas modeli w rodzinie
  Gemini, nie różnice między dostawcami.
