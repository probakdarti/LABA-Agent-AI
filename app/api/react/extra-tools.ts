import { tool } from "ai";
import { z } from "zod";

// Wszystkie narzędzia używają DARMOWYCH API bez klucza.
const TIMEOUT = 5000; // 5s — chroni przed zawieszeniem na wolnym API

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT),
    headers: { "User-Agent": "VermiReActAgent/1.0" },
  });
  if (!res.ok) throw new Error(`API zwróciło błąd ${res.status}`);
  return res.json();
}

// Wspólna obsługa błędu fetch (timeout vs. inny) → czytelny komunikat po polsku.
function fetchErrorMessage(err: unknown, what: string): string {
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return `Timeout — ${what} nie odpowiedziało w 5 sekund. Spróbuj ponownie.`;
  }
  return `Błąd (${what}): ${err instanceof Error ? err.message : "nieznany"}.`;
}

// ── 🌦️ Pogoda (Open-Meteo, bez klucza) ──────────────────────────────────────
const WMO: Record<number, string> = {
  0: "bezchmurnie",
  1: "głównie bezchmurnie",
  2: "częściowe zachmurzenie",
  3: "zachmurzenie",
  45: "mgła",
  48: "osadzająca się mgła",
  51: "słaba mżawka",
  53: "umiarkowana mżawka",
  55: "gęsta mżawka",
  61: "słaby deszcz",
  63: "umiarkowany deszcz",
  65: "silny deszcz",
  66: "marznący deszcz",
  67: "silny marznący deszcz",
  71: "słabe opady śniegu",
  73: "umiarkowane opady śniegu",
  75: "silne opady śniegu",
  77: "ziarna śniegu",
  80: "przelotny deszcz",
  81: "przelotny deszcz",
  82: "gwałtowny przelotny deszcz",
  85: "przelotne opady śniegu",
  86: "silne przelotne opady śniegu",
  95: "burza",
  96: "burza z gradem",
  99: "silna burza z gradem",
};

export const getWeather = tool({
  description:
    "Sprawdza AKTUALNĄ pogodę w podanym mieście (temperatura, opis, wiatr, wilgotność). Dane z Open-Meteo.",
  inputSchema: z.object({
    city: z.string().describe("Nazwa miasta, np. 'Kraków', 'Berlin'"),
  }),
  execute: async ({ city }) => {
    if (!city || !city.trim()) return { error: "Podaj nazwę miasta." };
    try {
      const geo = (await fetchJson(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pl&format=json`,
      )) as { results?: { latitude: number; longitude: number; name: string; country?: string }[] };
      const place = geo.results?.[0];
      if (!place) return { error: `Nie znalazłem miasta "${city}". Sprawdź pisownię.` };

      const w = (await fetchJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&timezone=auto`,
      )) as {
        current?: {
          temperature_2m: number;
          weather_code: number;
          wind_speed_10m: number;
          relative_humidity_2m: number;
        };
      };
      const c = w.current;
      if (!c) return { error: "Brak danych pogodowych dla tej lokalizacji." };

      return {
        city: place.name,
        country: place.country ?? "",
        temperature: c.temperature_2m,
        unit: "°C",
        description: WMO[c.weather_code] ?? `kod ${c.weather_code}`,
        windKmh: c.wind_speed_10m,
        humidity: c.relative_humidity_2m,
      };
    } catch (err) {
      return { error: fetchErrorMessage(err, "serwer pogody") };
    }
  },
});

// ── 💱 Kurs walut (Frankfurter, bez klucza) ──────────────────────────────────
export const getExchangeRate = tool({
  description:
    "Pobiera aktualny kurs wymiany walut (np. PLN→EUR). Zwraca kurs za 1 jednostkę waluty bazowej.",
  inputSchema: z.object({
    from: z.string().describe("Waluta bazowa, 3 litery, np. 'PLN'"),
    to: z.string().describe("Waluta docelowa, 3 litery, np. 'EUR'"),
  }),
  execute: async ({ from, to }) => {
    const base = (from ?? "").toUpperCase();
    const target = (to ?? "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(target)) {
      return { error: "Podaj 3-literowe kody walut (np. PLN, EUR, USD)." };
    }
    if (base === target) return { from: base, to: target, rate: 1, date: "dziś" };
    try {
      const data = (await fetchJson(
        `https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${target}`,
      )) as { rates?: Record<string, number>; date?: string };
      const rate = data.rates?.[target];
      if (rate == null) {
        return {
          error: `Nie znam kursu ${base}→${target}. Popularne waluty: EUR, USD, GBP, CHF, PLN.`,
        };
      }
      return { from: base, to: target, rate, date: data.date ?? "" };
    } catch (err) {
      return { error: fetchErrorMessage(err, "serwer kursów walut") };
    }
  },
});

// ── 📅 Święta (Nager.Date, bez klucza) ───────────────────────────────────────
export const getHolidays = tool({
  description:
    "Zwraca nadchodzące święta państwowe w danym kraju. Domyślnie Polska i bieżący rok. Podaje ile dni do najbliższego.",
  inputSchema: z.object({
    country: z.string().optional().describe("Kod kraju ISO, np. 'PL', 'DE' (domyślnie PL)"),
    year: z.number().optional().describe("Rok (domyślnie bieżący)"),
  }),
  execute: async ({ country, year }) => {
    const cc = (country ?? "PL").toUpperCase();
    const y = year ?? new Date().getFullYear();
    if (!/^[A-Z]{2}$/.test(cc)) {
      return { error: "Podaj 2-literowy kod kraju (np. PL, DE, US, GB, FR)." };
    }
    try {
      const all = (await fetchJson(
        `https://date.nager.at/api/v3/PublicHolidays/${y}/${cc}`,
      )) as { date: string; localName: string; name: string }[];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const upcoming = all
        .filter((h) => new Date(h.date) >= today)
        .slice(0, 10)
        .map((h) => ({ date: h.date, name: h.localName }));
      const next = upcoming[0];
      const daysToNext = next
        ? Math.round((new Date(next.date).getTime() - today.getTime()) / 86_400_000)
        : null;
      return { country: cc, year: y, next, daysToNext, upcoming };
    } catch (err) {
      if (err instanceof Error && err.message.includes("404")) {
        return { error: `Nie znalazłem świąt dla kraju "${cc}". Popularne: PL, DE, US, GB, FR.` };
      }
      return { error: fetchErrorMessage(err, "serwer świąt") };
    }
  },
});

// ── 📖 Wikipedia (bez klucza) ────────────────────────────────────────────────
export const searchWikipedia = tool({
  description:
    "Wyszukuje hasło w Wikipedii i zwraca streszczenie oraz link. Używaj do definicji i wiedzy encyklopedycznej.",
  inputSchema: z.object({
    query: z.string().describe("Czego szukać, np. 'ReAct sztuczna inteligencja'"),
    lang: z.string().optional().describe("Kod języka Wikipedii (domyślnie 'pl')"),
  }),
  execute: async ({ query, lang }) => {
    const l = lang ?? "pl";
    try {
      const search = (await fetchJson(
        `https://${l}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1&origin=*`,
      )) as { query?: { search?: { title: string }[] } };
      const title = search.query?.search?.[0]?.title;
      if (!title) return { error: `Brak wyników w Wikipedii dla: ${query}.` };

      const summary = (await fetchJson(
        `https://${l}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      )) as { extract?: string; content_urls?: { desktop?: { page?: string } } };
      return {
        title,
        extract: summary.extract ?? "(brak streszczenia)",
        url: summary.content_urls?.desktop?.page ?? `https://${l}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      };
    } catch (err) {
      return { error: fetchErrorMessage(err, "Wikipedia") };
    }
  },
});

// ── 📝 Notatki (pamięć procesu serwera dev) ──────────────────────────────────
// Uwaga: przechowywane w pamięci — resetują się przy restarcie serwera.
type Note = { text: string; at: string };
const notes: Note[] = [];

export const saveNote = tool({
  description: "Zapisuje notatkę do pamięci agenta. Używaj do zapamiętania wyników, ustaleń, list.",
  inputSchema: z.object({
    text: z.string().describe("Treść notatki do zapisania"),
  }),
  execute: async ({ text }) => {
    notes.push({ text, at: new Date().toISOString() });
    return { saved: true, count: notes.length };
  },
});

export const getNotes = tool({
  description: "Zwraca wszystkie zapisane wcześniej notatki agenta.",
  inputSchema: z.object({}),
  execute: async () => ({ count: notes.length, notes }),
});
