import { google } from "@ai-sdk/google";
import { respondWithModelRouting, lastUserText } from "../model-router";
import { readWebPage } from "./read-web-page";
import { type UIMessage } from "ai";

// Search Grounding to najdroższa funkcja API — domyślnie wyłączona (L06/W0).
if (process.env.ENABLE_SEARCH_GROUNDING === "true") {
  console.warn(
    "⚠️ UWAGA: Search Grounding jest WŁĄCZONY. " +
      "To jest najdroższa funkcja API ($14/1000 zapytań). " +
      "Używaj TYLKO do testów. Wyłącz po testach usuwając ENABLE_SEARCH_GROUNDING z .env.local, " +
      "bo inni uczestnicy kursu mają wtedy ograniczony dostęp do modeli.",
  );
}

// ── System prompt: agent z wyszukiwarką (Lekcja 3, Warsztat 1) ──────────────
const SYSTEM_PROMPT = `Jesteś asystentem z dostępem do prawdziwego internetu.

## Narzędzia
- google_search — wyszukiwarka Google. Używaj gdy potrzebujesz aktualnych informacji
  (wiadomości, ceny, wyniki sportowe, bieżące fakty). NIE używaj do prostych pytań,
  żartów czy ogólnej wiedzy, którą już znasz.
- readWebPage — czyta treść konkretnej strony WWW. Używaj gdy użytkownik podał URL.

## Zasady
- Gdy korzystasz z wyszukiwania — podawaj konkretne, aktualne informacje, nie zgaduj
- Zawsze wskazuj źródła (linki), z których korzystałeś
- Jeśli pytanie nie wymaga aktualnych danych z internetu — odpowiedz normalnie, bez szukania
- Język: polski
- Format: czysty markdown`;

const URL_REGEX = /https?:\/\/\S+/i;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  // Gemini nie wspiera łączenia własnego narzędzia funkcyjnego (readWebPage)
  // z narzędziem dostawcy (google_search) w jednym wywołaniu — trzeba wybrać
  // jedno z nich na podstawie treści wiadomości.
  const hasUrl = URL_REGEX.test(lastUserText(messages));
  const groundingEnabled = process.env.ENABLE_SEARCH_GROUNDING === "true";

  return respondWithModelRouting({
    req,
    system: SYSTEM_PROMPT,
    messages,
    logPrefix: "SEARCH",
    forceComplex: true,
    // Płatny google_search tylko gdy jawnie włączony; inaczej darmowe readWebPage.
    tools:
      hasUrl || !groundingEnabled
        ? { readWebPage }
        : { google_search: google.tools.googleSearch({}) },
  });
}
