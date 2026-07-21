import { ChatShell } from "../components/ChatShell";

const SCENARIOS = [
  "Planuję weekend w Krakowie. Sprawdź pogodę, znajdź ciekawe miejsca w Wikipedii i powiedz czy są jakieś święta w ten weekend",
  "Mam 5000 EUR do wydania. Przelicz na PLN, sprawdź ile to w dolarach i zapisz wszystkie kursy w notatkach",
  "Porównaj pogodę w Warszawie, Berlinie i Paryżu. Który z tych miast ma dziś najlepszą pogodę?",
  "Ile dni do następnego święta w Polsce? Jaka będzie wtedy pogoda w Warszawie?",
];

export default function ReactPage() {
  return (
    <ChatShell
      apiEndpoint="/api/react"
      headerTitle="🔄 Agent ReAct — Autonomiczne rozumowanie"
      headerSubtitle="Opisz cel → agent sam planuje i realizuje"
      inputPlaceholder="Opisz co chcesz osiągnąć..."
      examples={SCENARIOS}
      reactMode
      diagnostics
    />
  );
}
