"""
VERMI — PM ASSISTANT (chatbot konsolowy)
=========================================
Zadanie 1 (LABA) — modyfikacja chatbota o instrukcję systemową dla wybranej domeny
(zarządzanie projektami) + porównanie 3 modeli.

Ten sam system prompt co w aplikacji webowej (app/api/chat/route.ts) — dzięki temu
porównanie modeli jest miarodajne dla realnego projektu, a nie dla sztucznego przykładu.

URUCHOMIENIE
------------
    python chatbot.py                  # tryb interaktywny (rozmowa)
    python chatbot.py --demo           # 3-turowa rozmowa demo (pod screenshot)
    python chatbot.py --porownaj       # benchmark: to samo pytanie na 3 modelach
    python chatbot.py --modele         # lista modeli dostępnych dla Twojego klucza

KOMENDY W TRYBIE INTERAKTYWNYM
------------------------------
    /model 2            — przełącz aktywny model na nr 2
    /porownaj <pytanie> — zadaj to samo pytanie wszystkim 3 modelom
    /reset              — wyczyść pamięć rozmowy
    /pomoc              — lista komend
    /koniec             — wyjście
"""

from __future__ import annotations

import logging
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

# Konsola Windows domyślnie nie jest UTF-8 — bez tego emoji z promptu wysypią print().
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# SDK Google wypisuje ostrzeżenie o "automatic function calling" przy każdym starcie —
# nie używamy narzędzi, więc wyciszamy je, żeby nie zaśmiecało rozmowy.
logging.getLogger("google_genai.models").setLevel(logging.ERROR)


# ─────────────────────────────────────────────────────────────────────────────
# 1. INSTRUKCJA SYSTEMOWA (domena: zarządzanie projektami)
# ─────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """# VERMI — PM ASSISTANT (Asystent ds. zarządzania projektami)

## KIM JESTEM
Jestem doświadczonym Project Managerem z 8-letnim doświadczeniem w prowadzeniu projektów IT i wdrożeniowych.
Specjalizuję się w metodykach zwinnych (Agile/Scrum), zarządzaniu ryzykiem oraz planowaniu i harmonogramowaniu.
Pracowałem z zespołami produktowymi, firmami wdrażającymi systemy (ERP/CRM) oraz startupami i korporacjami.

## JAK ODPOWIADAM

### Struktura każdej odpowiedzi:
1. 📋 **Kontekst** — potwierdzam zrozumienie pytania (1 zdanie)
2. 🔍 **Analiza** — merytoryczna odpowiedź (max 2 akapity)
3. ✅ **Rekomendacja** — konkretne działanie do podjęcia (1-3 punkty)
4. ❓ **Pytanie** — jedno pytanie pogłębiające do użytkownika

### Zasady:
- ZANIM odpowiem na złożone pytanie — pytam o kontekst, jeśli go brakuje
- Gdy podaję fakty — oznaczam pewność: ✓ pewne, ~ przybliżone, ? do weryfikacji
- **Pogrubiam** kluczowe terminy przy pierwszym użyciu
- Używam list numerowanych dla kroków, punktowanych dla opcji
- Maksymalnie 3 akapity + rekomendacja

### Styl:
- Język: polski
- Ton: profesjonalny, ale przystępny
- Gdy używam terminu branżowego — wyjaśniam go krótko w nawiasie

## PAMIĘĆ
- Pamiętasz CAŁĄ rozmowę od początku i nawiązujesz do wcześniejszych wiadomości
- Jeśli użytkownik podał imię — używaj go konsekwentnie
- Gdy użytkownik napisze "podsumuj" lub "co ustaliliśmy" — streść rozmowę w numerowanej liście
  (główne tematy → kluczowe ustalenia → co jeszcze mogę pomóc)

## CZEGO NIE ROBIĘ
- Nie odpowiadam na pytania spoza zarządzania projektami — mówię wprost: "To nie moja specjalizacja, ale mogę pomóc z zarządzaniem projektami" i proponuję, co MOGĘ zrobić
- Nie udaję, że wiem coś, czego nie wiem
- Nie udzielam porad prawnych, medycznych ani finansowych — odsyłam do specjalisty"""


# ─────────────────────────────────────────────────────────────────────────────
# 2. KONFIGURACJA MODELI (3 modele do porównania)
# ─────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class ModelSpec:
    """Jeden wariant modelu w porównaniu."""

    label: str  # nazwa czytelna dla człowieka
    provider: str  # "google" | "openai" | "anthropic"
    model: str  # identyfikator modelu u dostawcy
    opis: str  # po co go tu mamy


# Trzy różne półki wydajności u jednego dostawcy (tylko klucz Google w projekcie).
# Kod obsługuje też OpenAI i Anthropic — patrz PROVIDERS niżej: wystarczy dopisać
# ModelSpec z provider="openai"/"anthropic" i ustawić odpowiedni klucz w .env.local.
# Uwaga: modele Pro (gemini-3.1-pro-preview, gemini-pro-latest) mają na darmowym
# planie limit 0 → zwracają 429. Poniższe trio zweryfikowano jako działające.
# Aktualną listę dla własnego klucza sprawdzisz komendą: python chatbot.py --modele
MODELS: list[ModelSpec] = [
    ModelSpec(
        label="Gemini 2.5 Flash Lite",
        provider="google",
        model="gemini-2.5-flash-lite",
        opis="poprzednia generacja — punkt odniesienia (baseline)",
    ),
    ModelSpec(
        label="Gemini 3.1 Flash Lite",
        provider="google",
        model="gemini-3.1-flash-lite",
        opis="model produkcyjny aplikacji VERMI — najtańszy z generacji 3",
    ),
    ModelSpec(
        label="Gemini 3.6 Flash",
        provider="google",
        model="gemini-3.6-flash",
        opis="najmocniejszy dostępny na darmowym planie (z rozumowaniem)",
    ),
]


# ─────────────────────────────────────────────────────────────────────────────
# 3. KLUCZE API (czytane z .env.local projektu — bez duplikowania sekretów)
# ─────────────────────────────────────────────────────────────────────────────


def wczytaj_env() -> None:
    """Dociąga zmienne z .env.local (katalog projektu wyżej) do os.environ.

    Prosty parser zamiast python-dotenv — mniej zależności do zainstalowania.
    Zmienne już ustawione w systemie mają pierwszeństwo (nie nadpisujemy ich).
    """
    kandydaci = [
        Path(__file__).parent / ".env.local",
        Path(__file__).parent.parent / ".env.local",
    ]
    for plik in kandydaci:
        if not plik.exists():
            continue
        for linia in plik.read_text(encoding="utf-8").splitlines():
            linia = linia.strip()
            if not linia or linia.startswith("#") or "=" not in linia:
                continue
            klucz, _, wartosc = linia.partition("=")
            klucz = klucz.strip()
            wartosc = wartosc.strip().strip('"').strip("'")
            if klucz and wartosc and klucz not in os.environ:
                os.environ[klucz] = wartosc


def klucz(*nazwy: str) -> str | None:
    """Zwraca pierwszy niepusty klucz API spośród podanych nazw zmiennych."""
    for nazwa in nazwy:
        wartosc = os.environ.get(nazwa, "").strip()
        if wartosc:
            return wartosc
    return None


# ─────────────────────────────────────────────────────────────────────────────
# 4. WARSTWA DOSTAWCÓW — jedno wspólne wejście/wyjście dla każdego API
# ─────────────────────────────────────────────────────────────────────────────


@dataclass
class Odpowiedz:
    """Ujednolicony wynik zapytania — niezależny od dostawcy."""

    tekst: str
    sekundy: float
    tokeny_in: int = 0
    tokeny_out: int = 0
    blad: str | None = None


# Historia rozmowy w formacie neutralnym: [{"role": "user"|"assistant", "text": "..."}]
Historia = list[dict[str, str]]


def zapytaj_google(spec: ModelSpec, historia: Historia) -> Odpowiedz:
    from google import genai
    from google.genai import types

    api_key = klucz("GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY")
    if not api_key:
        return Odpowiedz("", 0.0, blad="Brak GOOGLE_GENERATIVE_AI_API_KEY w .env.local")

    client = genai.Client(api_key=api_key)
    contents = [
        types.Content(
            role="user" if w["role"] == "user" else "model",
            parts=[types.Part(text=w["text"])],
        )
        for w in historia
    ]

    start = time.perf_counter()
    try:
        resp = client.models.generate_content(
            model=spec.model,
            contents=contents,
            config=types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT),
        )
    except Exception as e:  # limit / brak modelu / brak sieci
        return Odpowiedz("", time.perf_counter() - start, blad=f"{type(e).__name__}: {e}")

    czas = time.perf_counter() - start
    u = resp.usage_metadata
    return Odpowiedz(
        tekst=(resp.text or "").strip(),
        sekundy=czas,
        tokeny_in=getattr(u, "prompt_token_count", 0) or 0,
        tokeny_out=getattr(u, "candidates_token_count", 0) or 0,
    )


def zapytaj_openai(spec: ModelSpec, historia: Historia) -> Odpowiedz:
    api_key = klucz("OPENAI_API_KEY")
    if not api_key:
        return Odpowiedz("", 0.0, blad="Brak OPENAI_API_KEY w .env.local")
    try:
        from openai import OpenAI
    except ImportError:
        return Odpowiedz("", 0.0, blad="Brak pakietu: pip install openai")

    client = OpenAI(api_key=api_key)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += [{"role": w["role"], "content": w["text"]} for w in historia]

    start = time.perf_counter()
    try:
        resp = client.chat.completions.create(model=spec.model, messages=messages)
    except Exception as e:
        return Odpowiedz("", time.perf_counter() - start, blad=f"{type(e).__name__}: {e}")

    czas = time.perf_counter() - start
    u = resp.usage
    return Odpowiedz(
        tekst=(resp.choices[0].message.content or "").strip(),
        sekundy=czas,
        tokeny_in=getattr(u, "prompt_tokens", 0) or 0,
        tokeny_out=getattr(u, "completion_tokens", 0) or 0,
    )


def zapytaj_anthropic(spec: ModelSpec, historia: Historia) -> Odpowiedz:
    api_key = klucz("ANTHROPIC_API_KEY")
    if not api_key:
        return Odpowiedz("", 0.0, blad="Brak ANTHROPIC_API_KEY w .env.local")
    try:
        import anthropic
    except ImportError:
        return Odpowiedz("", 0.0, blad="Brak pakietu: pip install anthropic")

    client = anthropic.Anthropic(api_key=api_key)
    messages = [{"role": w["role"], "content": w["text"]} for w in historia]

    start = time.perf_counter()
    try:
        resp = client.messages.create(
            model=spec.model,
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            messages=messages,
        )
    except Exception as e:
        return Odpowiedz("", time.perf_counter() - start, blad=f"{type(e).__name__}: {e}")

    czas = time.perf_counter() - start
    tekst = "".join(b.text for b in resp.content if b.type == "text").strip()
    return Odpowiedz(
        tekst=tekst,
        sekundy=czas,
        tokeny_in=resp.usage.input_tokens,
        tokeny_out=resp.usage.output_tokens,
    )


PROVIDERS = {
    "google": zapytaj_google,
    "openai": zapytaj_openai,
    "anthropic": zapytaj_anthropic,
}


def zapytaj(spec: ModelSpec, historia: Historia) -> Odpowiedz:
    """Kieruje zapytanie do właściwego dostawcy."""
    funkcja = PROVIDERS.get(spec.provider)
    if funkcja is None:
        return Odpowiedz("", 0.0, blad=f"Nieznany dostawca: {spec.provider}")
    return funkcja(spec, historia)


# ─────────────────────────────────────────────────────────────────────────────
# 5. ROZMOWA (pamięć całej konwersacji)
# ─────────────────────────────────────────────────────────────────────────────


@dataclass
class Rozmowa:
    aktywny: int = 0  # indeks w MODELS
    historia: Historia = field(default_factory=list)

    @property
    def spec(self) -> ModelSpec:
        return MODELS[self.aktywny]

    def wyslij(self, pytanie: str) -> Odpowiedz:
        self.historia.append({"role": "user", "text": pytanie})
        odp = zapytaj(self.spec, self.historia)
        if odp.blad:
            self.historia.pop()  # nie zapisujemy tury, która się nie udała
        else:
            self.historia.append({"role": "assistant", "text": odp.tekst})
        return odp


# ─────────────────────────────────────────────────────────────────────────────
# 6. WYPISYWANIE
# ─────────────────────────────────────────────────────────────────────────────

KRESKA = "─" * 78


def naglowek() -> None:
    print(KRESKA)
    print("  VERMI — PM ASSISTANT  |  chatbot konsolowy (Zadanie 1)")
    print(KRESKA)
    for i, m in enumerate(MODELS, start=1):
        print(f"  [{i}] {m.label:<24} {m.model:<26} — {m.opis}")
    print(KRESKA)
    print("  Komendy: /model <nr>  /porownaj <pytanie>  /reset  /pomoc  /koniec")
    print(KRESKA)


def pokaz(odp: Odpowiedz, etykieta: str) -> None:
    if odp.blad:
        print(f"\n❌ [{etykieta}] {odp.blad}\n")
        return
    print(f"\n🤖 [{etykieta}]\n")
    print(odp.tekst)
    print(
        f"\n   ⏱ {odp.sekundy:.1f}s | tokeny: {odp.tokeny_in} in / {odp.tokeny_out} out"
    )


# ─────────────────────────────────────────────────────────────────────────────
# 7. TRYBY URUCHOMIENIA
# ─────────────────────────────────────────────────────────────────────────────

# Pytania testowe do benchmarku — dobrane pod domenę (PM), różna złożoność.
PYTANIA_BENCHMARK = [
    "Prowadzę wdrożenie systemu ERP w firmie produkcyjnej, 40 osób, 9 miesięcy. "
    "Jakie są 3 największe ryzyka i jak je zmitygować?",
    "Zespół nie dowozi sprintów — commitment 40 SP, dowozimy 25. Od czego zacząć diagnozę?",
    "Czym różni się rejestr ryzyk od rejestru problemów?",
]

# Scenariusz demo — 3 tury, trzecia sprawdza PAMIĘĆ rozmowy (nawiązuje do poprzednich).
SCENARIUSZ_DEMO = [
    "Cześć, mam na imię Paweł. Prowadzę wdrożenie systemu ERP w firmie produkcyjnej — "
    "40 osób w zespole, budżet 9 miesięcy. Od czego zacząć?",
    "Zespół nie dowozi sprintów: commitment 40 story points, dowozimy średnio 25. "
    "Co z tym zrobić?",
    "Podsumuj, co ustaliliśmy do tej pory.",
]


def tryb_demo(nr_modelu: int = 2) -> None:
    """3-turowa rozmowa bez interakcji — gotowa pod screenshot do zadania.

    Trzecia tura ("podsumuj") weryfikuje, czy model pamięta całą rozmowę.
    Domyślnie model nr 2 (produkcyjny model VERMI); zmienisz: --demo 3
    """
    naglowek()
    rozmowa = Rozmowa(aktywny=max(0, min(nr_modelu, len(MODELS))) - 1)
    print(f"\n  Model: {rozmowa.spec.label} ({rozmowa.spec.model})\n")

    for nr, pytanie in enumerate(SCENARIUSZ_DEMO, start=1):
        print(KRESKA)
        print(f"  TURA {nr}/3")
        print(KRESKA)
        print(f"\n🧑 {pytanie}")
        pokaz(rozmowa.wyslij(pytanie), rozmowa.spec.label)
        print()


def tryb_porownaj(pytanie: str | None = None) -> None:
    """To samo pytanie → 3 modele → odpowiedzi + czas + tokeny obok siebie."""
    naglowek()
    pytania = [pytanie] if pytanie else PYTANIA_BENCHMARK

    for nr, p in enumerate(pytania, start=1):
        print(f"\n{KRESKA}")
        print(f"  PYTANIE {nr}/{len(pytania)}: {p}")
        print(KRESKA)

        wyniki: list[tuple[ModelSpec, Odpowiedz]] = []
        for spec in MODELS:
            odp = zapytaj(spec, [{"role": "user", "text": p}])
            wyniki.append((spec, odp))
            pokaz(odp, f"{spec.label} · {spec.model}")

        print(f"\n{KRESKA}")
        print(f"  PODSUMOWANIE — pytanie {nr}")
        print(KRESKA)
        print(f"  {'Model':<24} {'Czas':>8} {'Tok. in':>9} {'Tok. out':>9} {'Znaki':>8}")
        for spec, odp in wyniki:
            if odp.blad:
                print(f"  {spec.label:<24} {'BŁĄD':>8}  {odp.blad[:30]}")
            else:
                print(
                    f"  {spec.label:<24} {odp.sekundy:>7.1f}s "
                    f"{odp.tokeny_in:>9} {odp.tokeny_out:>9} {len(odp.tekst):>8}"
                )
        print()


def tryb_modele() -> None:
    """Lista modeli dostępnych dla Twojego klucza — przydatne, gdy nazwa się zdezaktualizuje."""
    from google import genai

    api_key = klucz("GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY")
    if not api_key:
        print("❌ Brak GOOGLE_GENERATIVE_AI_API_KEY w .env.local")
        return
    client = genai.Client(api_key=api_key)
    print("Modele dostępne dla Twojego klucza (obsługujące generateContent):\n")
    for m in sorted(client.models.list(), key=lambda x: x.name):
        if "generateContent" in (m.supported_actions or []):
            print("  " + m.name.replace("models/", ""))


def tryb_interaktywny() -> None:
    naglowek()
    rozmowa = Rozmowa()
    print(f"\n  Aktywny model: {rozmowa.spec.label}\n")

    while True:
        try:
            wejscie = input("🧑 Ty: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n\nDo zobaczenia! 👋")
            return
        if not wejscie:
            continue

        # ── Komendy ──────────────────────────────────────────────────────────
        if wejscie in ("/koniec", "/exit", "/quit"):
            print("\nDo zobaczenia! 👋")
            return

        if wejscie == "/pomoc":
            print(
                "\n  /model <nr>          — przełącz model (1-3)\n"
                "  /porownaj <pytanie>  — to samo pytanie na 3 modelach\n"
                "  /reset               — wyczyść pamięć rozmowy\n"
                "  /koniec              — wyjście\n"
            )
            continue

        if wejscie == "/reset":
            rozmowa.historia.clear()
            print("\n  🧹 Pamięć rozmowy wyczyszczona.\n")
            continue

        if wejscie.startswith("/model"):
            czesci = wejscie.split()
            if len(czesci) == 2 and czesci[1].isdigit() and 1 <= int(czesci[1]) <= len(MODELS):
                rozmowa.aktywny = int(czesci[1]) - 1
                print(f"\n  🔀 Model: {rozmowa.spec.label} ({rozmowa.spec.model})")
                print("     (historia rozmowy zachowana)\n")
            else:
                print(f"\n  Użycie: /model <1-{len(MODELS)}>\n")
            continue

        if wejscie.startswith("/porownaj"):
            pytanie = wejscie[len("/porownaj") :].strip()
            if not pytanie:
                print("\n  Użycie: /porownaj <pytanie>\n")
                continue
            for spec in MODELS:
                pokaz(zapytaj(spec, [{"role": "user", "text": pytanie}]), spec.label)
            print()
            continue

        # ── Zwykła wiadomość ─────────────────────────────────────────────────
        pokaz(rozmowa.wyslij(wejscie), rozmowa.spec.label)
        print()


def main() -> None:
    wczytaj_env()
    argumenty = sys.argv[1:]

    if "--demo" in argumenty:
        reszta = [a for a in argumenty if a != "--demo"]
        nr = int(reszta[0]) if reszta and reszta[0].isdigit() else 2
        tryb_demo(nr)
    elif "--modele" in argumenty:
        tryb_modele()
    elif "--porownaj" in argumenty:
        reszta = [a for a in argumenty if a != "--porownaj"]
        tryb_porownaj(" ".join(reszta) if reszta else None)
    else:
        tryb_interaktywny()


if __name__ == "__main__":
    main()
