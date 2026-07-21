import { ChatShell } from "../components/ChatShell";

export default function ThinkPage() {
  return (
    <ChatShell
      apiEndpoint="/api/think"
      headerTitle="🧠 Tryb głębokiego myślenia"
      headerSubtitle="Agent pokazuje tok rozumowania krok po kroku"
      inputPlaceholder="Zadaj trudne pytanie..."
    />
  );
}
