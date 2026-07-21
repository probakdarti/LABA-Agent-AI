import { respondWithModelRouting } from "../model-router";
import { readWebPage } from "../search/read-web-page";
import { calculator, currentDateTime, webSearch, generateImage } from "./tools";
import {
  fetchUserContext,
  personalizationPrompt,
  userProfileTools,
} from "../chat/personalization";
import { type UIMessage } from "ai";

// ── System prompt: agent "pełnej mocy" (Lekcja 3, Warsztat 4) ────────────────
const SYSTEM_PROMPT = `Jesteś autonomicznym agentem AI z zestawem narzędzi. Sam decydujesz, których użyć i w jakiej kolejności, aby wykonać zadanie użytkownika.

## Twoje narzędzia
- 🧮 calculator — obliczenia matematyczne (VAT, procenty, sumy)
- 🕐 currentDateTime — aktualna data i godzina
- 🌐 webSearch — wyszukiwanie aktualnych informacji w Google
- 📄 readWebPage — pobranie i przeczytanie treści konkretnej strony WWW (gdy jest URL)
- 🎨 generateImage — wygenerowanie obrazu/logo/grafiki z opisu
- 👁️ (wizja natywna) — jeśli użytkownik dołączył obraz, analizujesz go bezpośrednio

## Zasady
- Łącz narzędzia gdy trzeba: np. najpierw webSearch, potem generateImage dla grafiki o znalezionym temacie
- Używaj narzędzi tylko gdy są potrzebne — na proste pytania odpowiadaj wprost
- Po użyciu narzędzi napisz zwięzłe, konkretne podsumowanie po polsku
- Gdy generujesz obraz — nie opisuj base64, po prostu zapowiedz że obraz jest poniżej
- Cytuj źródła z webSearch, jeśli były
- Język: polski, format: czysty markdown

## OBSŁUGA BŁĘDÓW:
- Jeśli narzędzie zwróci błąd — NIE powtarzaj tego samego wywołania z tymi samymi argumentami
- Poinformuj użytkownika i zaproponuj alternatywę (inne dane wejściowe lub inne narzędzie)
- Jeśli po 3 nieudanych próbach brak danych — powiedz wprost czego brakuje`;

export async function POST(req: Request) {
  const { messages, userId }: { messages: UIMessage[]; userId?: string } =
    await req.json();

  // Personalizacja (W3): profil użytkownika + narzędzia zapisu imienia/preferencji.
  const userContext = await fetchUserContext(userId);
  const system = SYSTEM_PROMPT + personalizationPrompt(userContext);
  const profileTools = userProfileTools(userId);

  return respondWithModelRouting({
    req,
    system,
    messages,
    logPrefix: "AGENT",
    speed: "fast",
    tools: {
      calculator,
      currentDateTime,
      webSearch,
      readWebPage,
      generateImage,
      ...(profileTools ?? {}),
    },
  });
}
