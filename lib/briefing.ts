import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { supabase } from "@/lib/supabase";

// Wspólna logika porannego briefingu (L09/W1) — używana przez:
// - /api/cron/morning (harmonogram Vercel Cron, zabezpieczony CRON_SECRET)
// - /api/briefings/generate (ręczny przycisk "Wygeneruj teraz" na /briefings)

const WARSAW = { lat: 52.2298, lon: 21.0118 };

const WMO: Record<number, string> = {
  0: "bezchmurnie", 1: "głównie bezchmurnie", 2: "częściowe zachmurzenie", 3: "zachmurzenie",
  45: "mgła", 48: "osadzająca się mgła", 51: "słaba mżawka", 53: "mżawka", 55: "gęsta mżawka",
  61: "słaby deszcz", 63: "deszcz", 65: "silny deszcz", 71: "słabe opady śniegu",
  73: "opady śniegu", 75: "silne opady śniegu", 80: "przelotny deszcz", 81: "przelotny deszcz",
  82: "gwałtowny deszcz", 95: "burza", 96: "burza z gradem", 99: "silna burza z gradem",
};

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(6000),
    headers: { "User-Agent": "VermiMorningBriefing/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function getWeather(): Promise<string> {
  try {
    const w = (await fetchJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${WARSAW.lat}&longitude=${WARSAW.lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&timezone=auto`,
    )) as {
      current?: { temperature_2m: number; weather_code: number; wind_speed_10m: number; relative_humidity_2m: number };
    };
    const c = w.current;
    if (!c) return "brak danych pogodowych";
    return `${c.temperature_2m}°C, ${WMO[c.weather_code] ?? "brak opisu"}, wiatr ${c.wind_speed_10m} km/h, wilgotność ${c.relative_humidity_2m}%`;
  } catch {
    return "brak danych pogodowych (błąd API)";
  }
}

async function getRate(base: string): Promise<string> {
  try {
    const data = (await fetchJson(
      `https://api.frankfurter.dev/v1/latest?base=${base}&symbols=PLN`,
    )) as { rates?: Record<string, number> };
    const rate = data.rates?.PLN;
    return rate != null ? `${rate.toFixed(4)} PLN` : "brak kursu";
  } catch {
    return "brak kursu (błąd API)";
  }
}

const SYSTEM_PROMPT = `Jesteś osobistym asystentem. Na podstawie podanych danych napisz poranny briefing (czysty markdown, po polsku) DOKŁADNIE w formacie:

# ☀️ Dzień dobry! Twój briefing na [data]

## 🌤️ Pogoda
[temperatura, opis oraz krótka rada co ubrać]

## 💶 Kursy walut
- EUR: [kurs] PLN
- USD: [kurs] PLN

## 📅 Dzisiejszy dzień
- Dzień tygodnia: [...]
- Uwagi: [np. czy weekend]

## 💡 Porada dnia
[Krótka, pozytywna porada na dzień]

Używaj WYŁĄCZNIE podanych danych. Bądź zwięzły i ciepły w tonie.`;

export type BriefingResult = {
  date: string;
  content: string;
  saved: boolean;
  saveError?: string;
};

/** Zbiera dane, generuje briefing (1 wywołanie AI) i zapisuje do tabeli briefings. */
export async function generateAndSaveBriefing(): Promise<BriefingResult> {
  const now = new Date();
  const dateISO = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(now);
  const datePL = new Intl.DateTimeFormat("pl-PL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Warsaw",
  }).format(now);

  const [weather, eur, usd] = await Promise.all([getWeather(), getRate("EUR"), getRate("USD")]);

  const dataBlock =
    `Data: ${datePL} (${dateISO})\n` +
    `Pogoda w Warszawie: ${weather}\n` +
    `Kurs 1 EUR: ${eur}\n` +
    `Kurs 1 USD: ${usd}`;

  const { text: content } = await generateText({
    model: google("gemini-3.1-flash-lite"),
    system: SYSTEM_PROMPT,
    prompt: `Dane na dziś:\n${dataBlock}`,
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    maxRetries: 1,
  });

  const { error } = await supabase.from("briefings").insert({ content, date: dateISO });
  if (error) {
    console.error("[briefing] błąd zapisu:", error.message);
    return { date: dateISO, content, saved: false, saveError: error.message };
  }
  return { date: dateISO, content, saved: true };
}
