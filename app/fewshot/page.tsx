import { ChatShell } from "../components/ChatShell";

const TERMS = [
  "Sztuczna inteligencja",
  "Agent AI",
  "Prompt",
  "Halucynacja AI",
  "RAG",
  "API",
];

export default function FewShotPage() {
  return (
    <ChatShell
      apiEndpoint="/api/fewshot"
      headerTitle="📚 Słownik AI"
      headerSubtitle="Wyjaśniam trudne pojęcia prostym językiem"
      inputPlaceholder="Wpisz pojęcie do wyjaśnienia..."
      termChips={TERMS}
    />
  );
}
