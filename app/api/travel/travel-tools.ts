import { tool } from "ai";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Rozszerzenia asystenta podróży:
//   • findRestaurants   — restauracje w mieście (OpenStreetMap / Overpass)
//   • getWeeklyForecast — prognoza na tydzień (Open-Meteo)
//   • compareTripOffers — porównanie ofert: TUI, Trivago, Wakacje.pl
//
// Wszystkie źródła są DARMOWE i nie wymagają klucza API.
// ─────────────────────────────────────────────────────────────────────────────

const GEO_TIMEOUT = 6000;
const FORECAST_TIMEOUT = 8000;
const OVERPASS_TIMEOUT = 20000; // Overpass bywa wolny — dajemy mu więcej czasu
const LINK_CHECK_TIMEOUT = 6000;

function errMsg(err: unknown, what: string): string {
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return `Timeout — ${what} nie odpowiedziało na czas. Spróbuj ponownie.`;
  }
  return `Błąd (${what}): ${err instanceof Error ? err.message : "nieznany"}.`;
}

type Place = { latitude: number; longitude: number; name: string; country?: string };

/** Zamienia nazwę miasta na współrzędne (Open-Meteo geocoding, bez klucza). */
async function geocode(city: string): Promise<Place | null> {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pl&format=json`,
    { signal: AbortSignal.timeout(GEO_TIMEOUT), headers: { "User-Agent": "VermiTravelAgent/1.0" } },
  );
  if (!res.ok) throw new Error(`geokoder zwrócił ${res.status}`);
  const data = (await res.json()) as { results?: Place[] };
  return data.results?.[0] ?? null;
}

// ── 🍽️ Restauracje ───────────────────────────────────────────────────────────
//
// Dwa źródła, w kolejności:
//   1. Google Places API — ma OCENY (1–5) i LICZBĘ OPINII. Wymaga GOOGLE_MAPS_API_KEY.
//   2. OpenStreetMap (Overpass) — zapas, gdy klucza brak lub Google zwróci błąd.
//      OSM nie zawiera ocen, więc wtedy pokazujemy same dane adresowe.
//
// Jedno zapytanie do Google zwraca do 20 lokali od razu z ocenami — dzięki temu
// nie odpytujemy API osobno dla każdej restauracji (koszt i limity).

/** Nazwy kuchni po polsku → tagi OSM (po angielsku). Google rozumie oba języki. */
const CUISINE_PL_EN: Record<string, string> = {
  włoska: "italian", włoską: "italian", japońska: "japanese", japońską: "japanese",
  sushi: "sushi", wegańska: "vegan", wegańską: "vegan", wegetariańska: "vegetarian",
  hiszpańska: "spanish", hiszpańską: "spanish", grecka: "greek", grecką: "greek",
  indyjska: "indian", indyjską: "indian", chińska: "chinese", chińską: "chinese",
  tajska: "thai", tajską: "thai", francuska: "french", francuską: "french",
  portugalska: "portuguese", portugalską: "portuguese", meksykańska: "mexican",
  lokalna: "regional", lokalną: "regional", "owoce morza": "seafood",
  "z owocami morza": "seafood", rybna: "seafood", pizza: "pizza", burgery: "burger",
};

function cuisineToOsmTag(cuisine?: string): string {
  const c = (cuisine ?? "").trim().toLowerCase();
  if (!c) return "";
  return CUISINE_PL_EN[c] ?? c.replace(/[^a-zA-Z_ -]/g, "");
}

/**
 * Link do wyszukania lokalu w Mapach Google — oficjalny schemat adresów Map,
 * NIE wymaga klucza API ani płatności. Otwiera kartę miejsca, gdzie widać
 * ocenę i opinie. Dzięki temu oceny są o jedno kliknięcie nawet bez Places API.
 */
function googleMapsSearchUrl(name: string, address: string | null, city: string): string {
  const query = [name, address, city].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

type Restaurant = {
  name: string;
  rating: number | null;
  reviews: number | null;
  cuisine: string | null;
  address: string | null;
  website: string | null;
  mapsUrl: string | null;
  priceLevel: string | null;
  openNow: boolean | null;
};

/**
 * Ranking uwzględniający wiarygodność oceny (średnia bayesowska).
 * Bez tego lokal z oceną 5,0 i trzema opiniami wygrywałby z 4,7 przy 3000 opinii.
 */
function credibilityScore(rating: number | null, reviews: number | null): number {
  if (rating == null) return 0;
  const v = reviews ?? 0;
  const m = 50; // próg wiarygodności (liczba opinii)
  const prior = 4.0; // typowa ocena restauracji
  return (v / (v + m)) * rating + (m / (v + m)) * prior;
}

const PRICE_LEVEL_PL: Record<string, string> = {
  PRICE_LEVEL_FREE: "bezpłatnie",
  PRICE_LEVEL_INEXPENSIVE: "$ tanio",
  PRICE_LEVEL_MODERATE: "$$ średnio",
  PRICE_LEVEL_EXPENSIVE: "$$$ drogo",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$ bardzo drogo",
};

/** Google Places (New) — Text Search. Zwraca oceny i liczbę opinii. */
async function googlePlacesRestaurants(
  city: string,
  cuisine: string | undefined,
  take: number,
): Promise<{ restaurants: Restaurant[] } | { error: string }> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { error: "BRAK_KLUCZA" };

  const textQuery = `restauracje ${cuisine?.trim() ?? ""} w ${city}`.replace(/\s+/g, " ").trim();

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      signal: AbortSignal.timeout(FORECAST_TIMEOUT),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        // Pobieramy tylko potrzebne pola — mniej danych i niższy koszt zapytania.
        "X-Goog-FieldMask":
          "places.displayName,places.formattedAddress,places.rating,places.userRatingCount," +
          "places.websiteUri,places.googleMapsUri,places.priceLevel,places.primaryTypeDisplayName," +
          "places.currentOpeningHours.openNow",
      },
      body: JSON.stringify({
        textQuery,
        languageCode: "pl",
        maxResultCount: Math.min(Math.max(take, 5), 20),
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      return { error: body?.error?.message ?? `Google Places zwróciło ${res.status}` };
    }

    const data = (await res.json()) as {
      places?: {
        displayName?: { text?: string };
        formattedAddress?: string;
        rating?: number;
        userRatingCount?: number;
        websiteUri?: string;
        googleMapsUri?: string;
        priceLevel?: string;
        primaryTypeDisplayName?: { text?: string };
        currentOpeningHours?: { openNow?: boolean };
      }[];
    };

    const restaurants: Restaurant[] = (data.places ?? [])
      .filter((p) => p.displayName?.text)
      .map((p) => ({
        name: p.displayName!.text!,
        rating: p.rating ?? null,
        reviews: p.userRatingCount ?? null,
        cuisine: p.primaryTypeDisplayName?.text ?? null,
        address: p.formattedAddress ?? null,
        website: p.websiteUri ?? null,
        // Gdyby Google nie zwróciło własnego odnośnika — budujemy link wyszukiwania.
        mapsUrl:
          p.googleMapsUri ??
          googleMapsSearchUrl(p.displayName!.text!, p.formattedAddress ?? null, city),
        priceLevel: p.priceLevel ? PRICE_LEVEL_PL[p.priceLevel] ?? p.priceLevel : null,
        openNow: p.currentOpeningHours?.openNow ?? null,
      }))
      .sort((a, b) => credibilityScore(b.rating, b.reviews) - credibilityScore(a.rating, a.reviews))
      .slice(0, take);

    return { restaurants };
  } catch (err) {
    return { error: errMsg(err, "Google Places") };
  }
}

export const findRestaurants = tool({
  description:
    "Znajduje restauracje w podanym mieście wraz z OCENĄ Google Maps (1–5) i LICZBĄ OPINII, adresem, " +
    "linkiem do Map, poziomem cen i informacją, czy jest teraz otwarte. " +
    "Opcjonalnie filtruje po rodzaju kuchni (po polsku lub angielsku, np. 'włoska', 'sushi', 'seafood'). " +
    "Gdy klucz do Google Maps nie jest skonfigurowany, zwraca dane z OpenStreetMap — wtedy BEZ ocen.",
  inputSchema: z.object({
    city: z.string().describe("Miasto, np. 'Barcelona', 'Rzym'"),
    cuisine: z
      .string()
      .optional()
      .describe("Rodzaj kuchni po angielsku, np. 'italian', 'japanese', 'vegan', 'seafood'"),
    limit: z.number().optional().describe("Ile pozycji zwrócić (domyślnie 12, maks. 25)"),
  }),
  execute: async ({ city, cuisine, limit }) => {
    if (!city?.trim()) return { error: "Podaj nazwę miasta." };
    const take = Math.min(Math.max(limit ?? 12, 1), 25);

    // ── Źródło 1: Google Places — z ocenami i liczbą opinii ──────────────────
    const google = await googlePlacesRestaurants(city, cuisine, take);
    if ("restaurants" in google && google.restaurants.length > 0) {
      const withRating = google.restaurants.filter((r) => r.rating != null).length;
      return {
        city,
        cuisineFilter: cuisine ?? null,
        count: google.restaurants.length,
        restaurants: google.restaurants,
        source: "Google Maps (Places API)",
        ratingsAvailable: true,
        note:
          `Oceny i liczba opinii pochodzą z Google Maps (${withRating} z ${google.restaurants.length} lokali ma ocenę). ` +
          "Lista uszeregowana z uwzględnieniem wiarygodności — wysoka ocena przy kilku opiniach nie wyprzedza " +
          "nieco niższej przy tysiącach opinii.",
      };
    }
    const googleError = "error" in google ? google.error : null;

    // ── Źródło 2 (zapasowe): OpenStreetMap — bez ocen ───────────────────────
    try {
      const place = await geocode(city);
      if (!place) return { error: `Nie znalazłem miasta "${city}". Sprawdź pisownię.` };

      // Filtr kuchni jako wyrażenie regularne (bez rozróżniania wielkości liter).
      const osmCuisine = cuisineToOsmTag(cuisine);
      const cuisineFilter = osmCuisine ? `["cuisine"~"${osmCuisine}",i]` : "";
      const query =
        `[out:json][timeout:18];` +
        `node["amenity"="restaurant"]["name"]${cuisineFilter}(around:2500,${place.latitude},${place.longitude});` +
        `out body ${take * 3};`;

      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(OVERPASS_TIMEOUT),
        headers: { "User-Agent": "VermiTravelAgent/1.0" },
      });
      if (!res.ok) throw new Error(`Overpass zwrócił ${res.status}`);

      const data = (await res.json()) as {
        elements?: { tags?: Record<string, string> }[];
      };

      const all = (data.elements ?? [])
        .map((e) => e.tags ?? {})
        .filter((t) => t.name)
        .map((t) => {
          const address =
            [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ") || null;
          return {
            name: t.name,
            cuisine: t.cuisine?.replace(/;/g, ", ") ?? null,
            address,
            website: t.website ?? t["contact:website"] ?? null,
            openingHours: t.opening_hours ?? null,
            vegetarian: t["diet:vegetarian"] ?? null,
            // Ocena i opinie są o jedno kliknięcie — bez klucza do Places API.
            mapsUrl: googleMapsSearchUrl(t.name, address, place.name),
          };
        });

      // Najpierw te z najpełniejszymi danymi (kuchnia + adres) — są użyteczniejsze.
      const score = (r: (typeof all)[number]) =>
        (r.cuisine ? 2 : 0) + (r.address ? 1 : 0) + (r.website ? 1 : 0);
      const restaurants = all.sort((a, b) => score(b) - score(a)).slice(0, take);

      if (restaurants.length === 0) {
        return {
          city: place.name,
          error: cuisine
            ? `Brak restauracji z kuchnią "${cuisine}" w OpenStreetMap dla ${place.name}. Spróbuj bez filtra kuchni.`
            : `Brak danych o restauracjach w OpenStreetMap dla ${place.name}.`,
        };
      }

      return {
        city: place.name,
        country: place.country ?? "",
        cuisineFilter: cuisine ?? null,
        count: restaurants.length,
        restaurants,
        source: "OpenStreetMap (Overpass API)",
        ratingsAvailable: false,
        mapsLinksAvailable: true,
        note:
          (googleError === "BRAK_KLUCZA"
            ? "Oceny liczbowe niedostępne (brak klucza GOOGLE_MAPS_API_KEY) — dane adresowe z OpenStreetMap. "
            : `Oceny liczbowe niedostępne (Google Maps: ${googleError ?? "nieznany błąd"}) — dane adresowe z OpenStreetMap. `) +
          "Każdy lokal ma jednak pole mapsUrl — link otwiera kartę miejsca w Mapach Google, " +
          "gdzie widać ocenę i opinie. Podaj ten link przy każdej pozycji.",
      };
    } catch (err) {
      return { error: errMsg(err, "baza OpenStreetMap") };
    }
  },
});

// ── 🌤️ Prognoza tygodniowa (Open-Meteo) ─────────────────────────────────────
const WMO: Record<number, string> = {
  0: "bezchmurnie", 1: "głównie bezchmurnie", 2: "częściowe zachmurzenie", 3: "zachmurzenie",
  45: "mgła", 48: "osadzająca się mgła",
  51: "słaba mżawka", 53: "umiarkowana mżawka", 55: "gęsta mżawka",
  61: "słaby deszcz", 63: "umiarkowany deszcz", 65: "silny deszcz",
  66: "marznący deszcz", 67: "silny marznący deszcz",
  71: "słabe opady śniegu", 73: "umiarkowane opady śniegu", 75: "silne opady śniegu", 77: "ziarna śniegu",
  80: "przelotny deszcz", 81: "przelotny deszcz", 82: "gwałtowny przelotny deszcz",
  85: "przelotne opady śniegu", 86: "silne przelotne opady śniegu",
  95: "burza", 96: "burza z gradem", 99: "silna burza z gradem",
};

export const getWeeklyForecast = tool({
  description:
    "Prognoza pogody na najbliższe dni (domyślnie 7) dla wybranego miasta: temperatura min/max, opis, " +
    "szansa opadów i wiatr — dzień po dniu. Używaj, gdy ktoś planuje wyjazd na dłużej niż jeden dzień.",
  inputSchema: z.object({
    city: z.string().describe("Miasto, np. 'Barcelona'"),
    days: z.number().optional().describe("Ile dni prognozy (domyślnie 7, maks. 16)"),
  }),
  execute: async ({ city, days }) => {
    if (!city?.trim()) return { error: "Podaj nazwę miasta." };
    const n = Math.min(Math.max(days ?? 7, 1), 16);
    try {
      const place = await geocode(city);
      if (!place) return { error: `Nie znalazłem miasta "${city}". Sprawdź pisownię.` };

      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
          `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max` +
          `&forecast_days=${n}&timezone=auto`,
        { signal: AbortSignal.timeout(FORECAST_TIMEOUT), headers: { "User-Agent": "VermiTravelAgent/1.0" } },
      );
      if (!res.ok) throw new Error(`serwer pogody zwrócił ${res.status}`);

      const data = (await res.json()) as {
        daily?: {
          time: string[];
          weather_code: number[];
          temperature_2m_max: number[];
          temperature_2m_min: number[];
          precipitation_sum: number[];
          precipitation_probability_max: (number | null)[];
          wind_speed_10m_max: number[];
        };
      };
      const d = data.daily;
      if (!d?.time?.length) return { error: "Brak danych prognozy dla tej lokalizacji." };

      const forecast = d.time.map((date, i) => ({
        date,
        weekday: new Intl.DateTimeFormat("pl-PL", { weekday: "long" }).format(new Date(date)),
        tempMin: Math.round(d.temperature_2m_min[i]),
        tempMax: Math.round(d.temperature_2m_max[i]),
        description: WMO[d.weather_code[i]] ?? `kod ${d.weather_code[i]}`,
        rainChance: d.precipitation_probability_max?.[i] ?? null,
        precipitationMm: d.precipitation_sum[i],
        windKmh: Math.round(d.wind_speed_10m_max[i]),
      }));

      const rainyDays = forecast.filter((f) => (f.rainChance ?? 0) >= 50 || f.precipitationMm >= 1).length;
      const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

      return {
        city: place.name,
        country: place.country ?? "",
        days: forecast.length,
        forecast,
        summary: {
          avgTempMax: avg(forecast.map((f) => f.tempMax)),
          avgTempMin: avg(forecast.map((f) => f.tempMin)),
          rainyDays,
          warmestDay: forecast.reduce((a, b) => (b.tempMax > a.tempMax ? b : a)).date,
        },
        source: "Open-Meteo",
      };
    } catch (err) {
      return { error: errMsg(err, "serwer pogody") };
    }
  },
});

// ── 💰 Porównanie ofert wyjazdów: TUI / Trivago / Wakacje.pl ──────────────────

// Znaki łączące (akcenty) zostające po normalizacji NFD — zapisane jawnym escape'em.
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/** Nazwa kierunku → slug używany w adresach (bez polskich znaków). */
function slugify(text: string): string {
  const map: Record<string, string> = {
    ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
  };
  return text
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => map[ch] ?? ch)
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Sprawdza, czy link faktycznie istnieje (żeby nie podsuwać adresów z błędem 404). */
async function linkWorks(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(LINK_CHECK_TIMEOUT),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const compareTripOffers = tool({
  description:
    "Przygotowuje porównanie ofert wyjazdu do danego kierunku w trzech serwisach: Wakacje.pl, TUI i Trivago. " +
    "Zwraca DZIAŁAJĄCE linki do wyszukiwania w każdym z nich (weryfikowane na żywo) wraz z informacją, " +
    "co dany serwis oferuje. UWAGA: nie pobiera cen — te portale nie udostępniają darmowego API i renderują " +
    "ceny dopiero w przeglądarce. Aby podać orientacyjne kwoty, użyj dodatkowo narzędzia webSearch.",
  inputSchema: z.object({
    destination: z.string().describe("Kierunek: miasto lub kraj, np. 'Grecja', 'Barcelona'"),
    month: z.string().optional().describe("Miesiąc/termin wyjazdu, np. 'sierpień' (opcjonalnie)"),
    people: z.number().optional().describe("Liczba osób (opcjonalnie)"),
  }),
  execute: async ({ destination, month, people }) => {
    if (!destination?.trim()) return { error: "Podaj kierunek podróży." };
    const dest = destination.trim();
    const slug = slugify(dest);
    const q = encodeURIComponent(dest);

    // Wakacje.pl — strona kierunku istnieje dla wielu miast i krajów, ale nie dla wszystkich.
    const wakacjeDeep = `https://www.wakacje.pl/wczasy/${slug}.html`;
    const wakacjeOk = await linkWorks(wakacjeDeep);

    const portals = [
      {
        name: "Wakacje.pl",
        type: "Wyjazdy pakietowe (lot + hotel)",
        url: wakacjeOk ? wakacjeDeep : "https://www.wakacje.pl/",
        exactMatch: wakacjeOk,
        note: wakacjeOk
          ? `Strona kierunku „${dest}" z ofertami wielu biur podróży.`
          : `Brak gotowej strony dla „${dest}" — link prowadzi do wyszukiwarki serwisu.`,
      },
      {
        name: "TUI",
        type: "Wyjazdy pakietowe biura TUI",
        url: "https://www.tui.pl/",
        exactMatch: false,
        note: "TUI nie udostępnia stałych adresów wyszukiwania — kierunek wpisz w wyszukiwarce na stronie głównej. Warto sprawdzić też zakładkę Last Minute.",
      },
      {
        name: "Trivago",
        type: "Porównywarka HOTELI (bez lotu)",
        url: `https://www.trivago.pl/pl/srl?search=${q}`,
        exactMatch: true,
        note: "Porównuje ceny tego samego hotelu w różnych serwisach rezerwacyjnych. Nie sprzedaje wycieczek z przelotem.",
      },
    ];

    return {
      destination: dest,
      month: month ?? null,
      people: people ?? null,
      portals,
      priceDisclaimer:
        "Cen nie da się pobrać automatycznie — TUI, Trivago i Wakacje.pl nie mają otwartego API, " +
        "a kwoty pojawiają się dopiero po uruchomieniu strony w przeglądarce. Podane linki otwierają " +
        "wyszukiwanie dla tego kierunku, gdzie widać aktualne ceny.",
      tip:
        "Aby podać orientacyjne widełki cenowe, wywołaj webSearch (np. 'wczasy Grecja sierpień cena od') " +
        "i oznacz kwoty jako przybliżone (~) wraz ze źródłem.",
    };
  },
});
