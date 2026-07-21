import { ChatShell } from "../components/ChatShell";

const EXAMPLES = [
  "Jakie są najnowsze wiadomości o sztucznej inteligencji?",
  "Ile kosztuje iPhone 16 Pro w Polsce?",
  "Kto wygrał ostatni mecz reprezentacji Polski?",
  "Jakie filmy są teraz w kinach?",
];

export default function SearchPage() {
  return (
    <ChatShell
      apiEndpoint="/api/search"
      headerTitle="🌐 Agent z wyszukiwarką"
      headerSubtitle="Przeszukuję prawdziwy internet i czytam strony"
      inputPlaceholder="Zapytaj o cokolwiek aktualnego..."
      examples={EXAMPLES}
    />
  );
}
