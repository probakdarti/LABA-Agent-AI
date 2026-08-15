"use client";

import { ChatShell } from "../components/ChatShell";
import { TravelDashboard } from "../components/TravelDashboard";

const TOOLS = [
  { emoji: "🌦️", label: "Pogoda" },
  { emoji: "📆", label: "Prognoza 7 dni" },
  { emoji: "🍽️", label: "Restauracje" },
  { emoji: "💰", label: "Ceny wycieczek" },
  { emoji: "💶", label: "Kursy walut" },
  { emoji: "📅", label: "Święta" },
  { emoji: "📖", label: "Wikipedia" },
  { emoji: "🧮", label: "Budżet" },
];

const SCENARIOS = [
  "Planuję weekend w Berlinie. Budżet: 2000 PLN",
  "Pokaż prognozę na tydzień dla Barcelony",
  "Poleć restauracje z owocami morza w Lizbonie",
  "Porównaj ceny wycieczek do Grecji w sierpniu dla 2 osób",
  "Porównaj Barcelonę i Lizbonę na wakacje",
];

export default function TravelPage() {
  return (
    <ChatShell
      apiEndpoint="/api/travel"
      headerTitle="✈️ Asystent podróży AI"
      headerSubtitle="Powiedz dokąd jedziesz — agent zaplanuje wszystko"
      inputPlaceholder="Np. Lecę do Barcelony na weekend..."
      examples={SCENARIOS}
      toolPanel={TOOLS}
      diagnostics
      headerPanel={({ ask, busy }) => <TravelDashboard ask={ask} busy={busy} />}
    />
  );
}
