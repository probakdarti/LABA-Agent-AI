import { ChatShell } from "../components/ChatShell";

const COMMANDS = [
  "/tabela języki programowania 2026",
  "/porownanie ChatGPT vs Claude",
  "/lista 5 kroków do pierwszego agenta AI",
  "/faq sztuczna inteligencja dla początkujących",
  "/email podziękowanie za udaną rekrutację",
];

export default function FormatPage() {
  return (
    <ChatShell
      apiEndpoint="/api/format"
      headerTitle="📐 Formatowanie"
      headerSubtitle="Agent odpowiada w tabeli, liście, porównaniu — na żądanie"
      inputPlaceholder="Wpisz komendę, np. /tabela ..."
      termChips={COMMANDS}
    />
  );
}
