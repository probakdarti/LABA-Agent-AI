"use client";

import { useEffect, useState } from "react";
import { Icon } from "./BrandIcons";

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard zakładki „Podróże" — dodatkowe opcje nad rozmową.
//
// Ustawiasz kierunek (+ termin i liczbę osób), a przyciski wysyłają do agenta
// gotowe polecenie. Obok pokazuje się aktualna pogoda dla wpisanego kierunku
// (Open-Meteo, bez klucza) — żeby panel od razu dawał konkretną informację.
//
// Kolory i ikony: wyłącznie istniejące tokeny motywu i zestaw ikon marki.
// ─────────────────────────────────────────────────────────────────────────────

const POPULAR = ["Barcelona", "Rzym", "Grecja", "Chorwacja", "Paryż", "Egipt"];

const MONTHS = [
  "dowolny termin", "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
  "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień",
];

const CUISINES = [
  { label: "dowolna kuchnia", value: "" },
  { label: "włoska", value: "włoską" },
  { label: "japońska / sushi", value: "japońską" },
  { label: "owoce morza", value: "z owocami morza" },
  { label: "wegańska", value: "wegańską" },
  { label: "lokalna", value: "lokalną" },
];

const WMO_SHORT: Record<number, string> = {
  0: "☀️ bezchmurnie", 1: "🌤️ prawie bezchmurnie", 2: "⛅ częściowe chmury", 3: "☁️ pochmurno",
  45: "🌫️ mgła", 48: "🌫️ mgła",
  51: "🌦️ mżawka", 53: "🌦️ mżawka", 55: "🌦️ gęsta mżawka",
  61: "🌧️ słaby deszcz", 63: "🌧️ deszcz", 65: "🌧️ silny deszcz",
  71: "🌨️ śnieg", 73: "🌨️ śnieg", 75: "❄️ silny śnieg",
  80: "🌦️ przelotny deszcz", 81: "🌦️ przelotny deszcz", 82: "⛈️ ulewa",
  95: "⛈️ burza", 96: "⛈️ burza z gradem", 99: "⛈️ silna burza",
};

type Weather = { city: string; temp: number; desc: string } | null;

export function TravelDashboard({
  ask,
  busy,
}: {
  ask: (text: string) => void;
  busy: boolean;
}) {
  const [destination, setDestination] = useState("");
  const [month, setMonth] = useState(MONTHS[0]);
  const [people, setPeople] = useState("2");
  const [cuisine, setCuisine] = useState("");
  const [weather, setWeather] = useState<Weather>(null);
  const [wxLoading, setWxLoading] = useState(false);

  const dest = destination.trim();
  const ready = dest.length >= 2 && !busy;

  // Podgląd pogody dla wpisanego kierunku (z opóźnieniem, żeby nie odpytywać przy
  // każdym wciśniętym klawiszu).
  useEffect(() => {
    if (dest.length < 3) {
      setWeather(null);
      return;
    }
    let cancelled = false;
    const id = setTimeout(async () => {
      setWxLoading(true);
      try {
        const g = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(dest)}&count=1&language=pl&format=json`,
        ).then((r) => r.json());
        const place = g?.results?.[0];
        if (!place) {
          if (!cancelled) setWeather(null);
          return;
        }
        const w = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code&timezone=auto`,
        ).then((r) => r.json());
        if (!cancelled && w?.current) {
          setWeather({
            city: place.name,
            temp: Math.round(w.current.temperature_2m),
            desc: WMO_SHORT[w.current.weather_code] ?? "",
          });
        }
      } catch {
        if (!cancelled) setWeather(null);
      } finally {
        if (!cancelled) setWxLoading(false);
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [dest]);

  const termin = month === MONTHS[0] ? "" : ` w terminie: ${month}`;
  const osoby = people && people !== "0" ? ` dla ${people} os.` : "";

  const actions: { icon: "travel" | "briefings" | "knowledge" | "report"; label: string; prompt: string }[] = [
    {
      icon: "travel",
      label: "Pełny plan podróży",
      prompt: `Zaplanuj wyjazd: ${dest}${termin}${osoby}. Podaj pełny plan (pogoda, waluta, święta, atrakcje, checklist).`,
    },
    {
      icon: "briefings",
      label: "Prognoza na 7 dni",
      prompt: `Pokaż prognozę pogody na najbliższy tydzień dla: ${dest}. Dodaj wnioski, co spakować i który dzień jest najlepszy na zwiedzanie.`,
    },
    {
      icon: "knowledge",
      label: "Restauracje",
      prompt: cuisine
        ? `Poleć restauracje serwujące kuchnię ${cuisine} w: ${dest}.`
        : `Poleć restauracje w: ${dest}.`,
    },
    {
      icon: "report",
      label: "Porównaj ceny wycieczek",
      prompt: `Porównaj oferty i ceny wycieczek do: ${dest}${termin}${osoby} w serwisach Wakacje.pl, TUI i Trivago.`,
    },
  ];

  // width:auto nadpisuje `.input { width: 100% }` z globals.css — bez tego każde
  // pole żądałoby pełnej szerokości i rząd łamałby się po jednym polu na linię.
  const fieldStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 13.5, width: "auto" };

  return (
    <div style={{ padding: "12px 16px 14px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="travel" size={16} /> Panel podróży
        </span>

        {/* Pogoda dla wpisanego kierunku — od razu konkret w panelu */}
        {dest.length >= 3 && (
          <span
            className="muted"
            style={{
              fontSize: 12.5,
              padding: "3px 10px",
              borderRadius: 999,
              border: "1px solid var(--border)",
              background: "var(--bg)",
            }}
          >
            {wxLoading
              ? "sprawdzam pogodę…"
              : weather
                ? `${weather.city}: ${weather.temp}°C ${weather.desc}`
                : "nie znam takiego miejsca"}
          </span>
        )}
      </div>

      {/* Kierunek + termin + liczba osób */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <input
          className="input"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Dokąd jedziesz? Np. Barcelona, Grecja…"
          style={{ ...fieldStyle, flex: 1, minWidth: 190 }}
          aria-label="Kierunek podróży"
        />
        <select
          className="input"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          style={{ ...fieldStyle, minWidth: 140 }}
          aria-label="Termin"
        >
          {MONTHS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input
          className="input"
          type="number"
          min={1}
          max={20}
          value={people}
          onChange={(e) => setPeople(e.target.value)}
          style={{ ...fieldStyle, width: 78 }}
          aria-label="Liczba osób"
          title="Liczba osób"
        />
        <select
          className="input"
          value={cuisine}
          onChange={(e) => setCuisine(e.target.value)}
          style={{ ...fieldStyle, minWidth: 150 }}
          aria-label="Rodzaj kuchni (dla wyszukiwania restauracji)"
          title="Rodzaj kuchni — używany przy wyszukiwaniu restauracji"
        >
          {CUISINES.map((c) => (
            <option key={c.label} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Opcje — każda wysyła gotowe polecenie do agenta */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            className="btn"
            onClick={() => ask(a.prompt)}
            disabled={!ready}
            title={ready ? a.prompt : "Najpierw wpisz kierunek podróży"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "8px 13px",
              fontSize: 13,
              cursor: ready ? "pointer" : "not-allowed",
              opacity: ready ? 1 : 0.55,
            }}
          >
            <Icon name={a.icon} size={15} />
            {a.label}
          </button>
        ))}
      </div>

      {/* Popularne kierunki — jedno kliknięcie wypełnia pole */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
        <span className="muted" style={{ fontSize: 12 }}>Popularne:</span>
        {POPULAR.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setDestination(p)}
            className="btn"
            style={{
              padding: "3px 11px",
              borderRadius: 999,
              fontSize: 12,
              background: "transparent",
              cursor: "pointer",
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {!ready && dest.length < 2 && (
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Wpisz kierunek, żeby odblokować opcje — albo po prostu napisz do agenta poniżej.
        </p>
      )}
    </div>
  );
}
