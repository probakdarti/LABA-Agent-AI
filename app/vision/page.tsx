import { ChatShell } from "../components/ChatShell";

const EXAMPLES = [
  "Co widzisz na tym obrazie?",
  "Wyciągnij cały tekst z tego screena",
  "Opisz to w 3 zdaniach",
  "Jakie kolory dominują? Podaj kody HEX",
];

export default function VisionPage() {
  return (
    <ChatShell
      apiEndpoint="/api/vision"
      headerTitle="👁️ Agent Vision"
      headerSubtitle="Wklej screenshot, wrzuć plik lub przeciągnij obraz"
      inputPlaceholder="Zadaj pytanie o obraz..."
      examples={EXAMPLES}
      visionMode
    />
  );
}
