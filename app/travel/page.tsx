import { ChatShell } from "../components/ChatShell";

const TOOLS = [
  { emoji: "🌦️", label: "Pogoda" },
  { emoji: "💶", label: "Kursy walut" },
  { emoji: "📅", label: "Święta" },
  { emoji: "📖", label: "Wikipedia" },
  { emoji: "🧮", label: "Budżet" },
];

const SCENARIOS = [
  "Planuję weekend w Berlinie. Budżet: 2000 PLN",
  "Lecę do Paryża na tydzień w sierpniu",
  "Wycieczka do Pragi z rodziną na 3 dni",
  "Podróż służbowa do Londynu w przyszłym tygodniu",
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
    />
  );
}
