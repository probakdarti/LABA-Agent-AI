// Dashboard: zbiera PRAWDZIWE dane bezpośrednio z darmowych API (równolegle,
// odpornie na błąd pojedynczego źródła). Bez agenta — dla szybkości.

const TIMEOUT = 5000;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT),
    headers: { "User-Agent": "VermiDashboard/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const WMO: Record<number, string> = {
  0: "bezchmurnie", 1: "głównie bezchmurnie", 2: "częściowe zachmurzenie",
  3: "zachmurzenie", 45: "mgła", 48: "osadzająca się mgła", 51: "słaba mżawka",
  53: "mżawka", 55: "gęsta mżawka", 61: "słaby deszcz", 63: "deszcz",
  65: "silny deszcz", 71: "słaby śnieg", 73: "śnieg", 75: "silny śnieg",
  80: "przelotny deszcz", 81: "przelotny deszcz", 82: "ulewa", 95: "burza",
  96: "burza z gradem", 99: "silna burza z gradem",
};

async function fetchWeather(city: string) {
  const geo = (await getJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pl&format=json`,
  )) as { results?: { latitude: number; longitude: number; name: string }[] };
  const place = geo.results?.[0];
  if (!place) throw new Error("miasto nieznane");
  const w = (await getJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&timezone=auto`,
  )) as {
    current?: { temperature_2m: number; weather_code: number; wind_speed_10m: number; relative_humidity_2m: number };
  };
  const c = w.current!;
  return {
    city: place.name,
    temperature: c.temperature_2m,
    description: WMO[c.weather_code] ?? `kod ${c.weather_code}`,
    wind: c.wind_speed_10m,
    humidity: c.relative_humidity_2m,
  };
}

async function fetchRates() {
  const data = (await getJson(
    "https://api.frankfurter.dev/v1/latest?base=PLN&symbols=EUR,USD,GBP",
  )) as { rates?: Record<string, number>; date?: string };
  const r = data.rates ?? {};
  // frankfurter zwraca ile waluty za 1 PLN → odwracamy na "1 waluta = X PLN"
  const perPln = (code: string) => (r[code] ? +(1 / r[code]).toFixed(4) : null);
  return {
    date: data.date ?? "",
    EUR: perPln("EUR"),
    USD: perPln("USD"),
    GBP: perPln("GBP"),
  };
}

async function fetchHolidays() {
  const year = new Date().getFullYear();
  const all = (await getJson(
    `https://date.nager.at/api/v3/PublicHolidays/${year}/PL`,
  )) as { date: string; localName: string }[];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = all
    .filter((h) => new Date(h.date) >= today)
    .slice(0, 4)
    .map((h) => ({ date: h.date, name: h.localName }));
  // jeśli w tym roku nic już nie ma — weź początek przyszłego roku
  if (upcoming.length === 0) {
    const next = (await getJson(
      `https://date.nager.at/api/v3/PublicHolidays/${year + 1}/PL`,
    )) as { date: string; localName: string }[];
    upcoming.push(...next.slice(0, 4).map((h) => ({ date: h.date, name: h.localName })));
  }
  const daysToNext =
    upcoming[0] != null
      ? Math.round((new Date(upcoming[0].date).getTime() - today.getTime()) / 86_400_000)
      : null;
  return { upcoming, daysToNext };
}

export async function GET(req: Request) {
  const city = new URL(req.url).searchParams.get("city") || "Warszawa";

  const [weather, rates, holidays] = await Promise.allSettled([
    fetchWeather(city),
    fetchRates(),
    fetchHolidays(),
  ]);

  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Warsaw",
  }).format(now);
  const timeStr = new Intl.DateTimeFormat("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  }).format(now);

  const val = <T,>(r: PromiseSettledResult<T>) =>
    r.status === "fulfilled" ? r.value : null;

  return Response.json({
    datetime: { date: dateStr, time: timeStr },
    weather: val(weather),
    rates: val(rates),
    holidays: val(holidays),
    updatedAt: timeStr,
  });
}
