import { ChatShell } from "../components/ChatShell";

// Przykładowe pytania z dziedziny agenta — ułatwiają start rozmowy
const EXAMPLE_QUESTIONS = [
  "Jak zaplanować harmonogram projektu wdrożenia CRM?",
  "Jakie są największe ryzyka w projekcie i jak nimi zarządzać?",
  "Scrum czy Waterfall — co wybrać dla mojego projektu?",
  "Jak prowadzić zespół rozproszony w różnych strefach czasowych?",
];

export default function ChatPage() {
  return (
    <ChatShell
      apiEndpoint="/api/chat"
      headerTitle="📋 VERMI — Senior Project Manager"
      headerSubtitle="Ekspert od zarządzania projektami. Zapytaj mnie o harmonogramy, ryzyka, metodyki (Agile/Scrum) i pracę zespołu."
      inputPlaceholder="Napisz wiadomość..."
      examples={EXAMPLE_QUESTIONS}
      persist
      personalize
    />
  );
}
