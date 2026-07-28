import { google } from "@ai-sdk/google";
import { streamText, stepCountIs, type ToolSet } from "ai";
import { readWebPage } from "../search/read-web-page";
import { searchWikipedia } from "../react/extra-tools";
import { calculator } from "../agent/tools";

// Search Grounding to najdroższa funkcja API — domyślnie wyłączona (L06/W0).
if (process.env.ENABLE_SEARCH_GROUNDING === "true") {
  console.warn(
    "⚠️ UWAGA: Search Grounding jest WŁĄCZONY. " +
      "To jest najdroższa funkcja API ($14/1000 zapytań). " +
      "Używaj TYLKO do testów. Wyłącz po testach usuwając ENABLE_SEARCH_GROUNDING z .env.local.",
  );
}

const SYSTEM_PROMPT = `Jesteś profesjonalnym analitykiem biznesowym. Gdy użytkownik poda temat, AUTONOMICZNIE zbierasz informacje i piszesz raport.

## TWÓJ PROCES:
1. Przeanalizuj temat — co trzeba zbadać?
2. Szukaj danych: Wikipedia (searchWikipedia), konkretne strony WWW (readWebPage), obliczenia (calculator).
3. Zbierz fakty, liczby, statystyki.
4. Napisz raport w profesjonalnym formacie.

## FORMAT RAPORTU (czysty markdown):

# 📊 Raport: [TEMAT]
Data: [dzisiejsza data]
Autor: Agent AI

## Streszczenie (Executive Summary)
[3-4 zdania — kluczowe wnioski]

## 1. Wprowadzenie
[Kontekst, dlaczego ten temat jest ważny]

## 2. Kluczowe dane i fakty
[Wypunktowane dane — ze źródłami]

## 3. Analiza
[Interpretacja danych, trendy, porównania — użyj tabel, gdy pasują]

## 4. Wnioski i rekomendacje
[Co z tego wynika? Co robić?]

## Źródła
[Lista użytych źródeł z linkami]

ZASADY:
- Opieraj się na PRAWDZIWYCH danych z narzędzi — nie zmyślaj statystyk.
- Podawaj źródła. Gdy czegoś nie udało się zweryfikować — oznacz to wprost.
- Bądź konkretny: liczby, daty, nazwy. Raport: 500–1000 słów.
- Język: polski.`;

export async function POST(req: Request) {
  const { topic }: { topic?: string } = await req.json();

  if (!topic || !topic.trim()) {
    return Response.json({ error: "Podaj temat raportu." }, { status: 400 });
  }

  const groundingEnabled = process.env.ENABLE_SEARCH_GROUNDING === "true";
  // Gemini nie łączy narzędzia dostawcy (google_search) z własnymi narzędziami w jednym
  // wywołaniu — więc: grounding ON → google_search; grounding OFF → darmowe narzędzia.
  const tools: ToolSet = groundingEnabled
    ? { google_search: google.tools.googleSearch({}) }
    : { readWebPage, searchWikipedia, calculator };

  const today = new Date().toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const result = streamText({
    model: google("gemini-3.1-flash-lite"),
    system: `${SYSTEM_PROMPT}\n\nDzisiejsza data: ${today}.`,
    prompt: `Napisz profesjonalny raport biznesowy na temat: ${topic.trim()}`,
    tools,
    stopWhen: stepCountIs(8),
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    maxRetries: 1,
  });

  return result.toTextStreamResponse();
}
