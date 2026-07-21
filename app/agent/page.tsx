import { ChatShell } from "../components/ChatShell";

const TOOLS = [
  { emoji: "🧮", label: "Kalkulator" },
  { emoji: "🕐", label: "Data i czas" },
  { emoji: "🌐", label: "Google Search" },
  { emoji: "📄", label: "Czytanie stron" },
  { emoji: "🎨", label: "Generowanie obrazów" },
  { emoji: "👁️", label: "Analiza obrazów" },
];

const SCENARIOS = [
  "Znajdź w Google co robi firma Syntelligence i wygeneruj dla nich logo",
  "Przeczytaj stronę https://apple.com i opisz ich aktualną ofertę iPhone",
  "Ile to 23% VAT z 8500 PLN? Podaj kwotę brutto i netto",
  "Jakie są najnowsze wiadomości o AI? Wygeneruj grafikę do posta o tym",
  "Wyszukaj w Google 'best coffee shops Kraków' i streść wyniki",
];

export default function AgentPage() {
  return (
    <ChatShell
      apiEndpoint="/api/agent"
      headerTitle="🤖 Agent AI — Pełna moc"
      headerSubtitle={`${TOOLS.length} narzędzi • autonomiczne decyzje`}
      inputPlaceholder="Zleć zadanie — agent sam dobierze narzędzia..."
      examples={SCENARIOS}
      toolPanel={TOOLS}
      visionMode
      diagnostics
      personalize
    />
  );
}
