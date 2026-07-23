import { google } from "@ai-sdk/google";
import { streamText, stepCountIs, type ToolSet } from "ai";
import { readWebPage } from "../search/read-web-page";
import { searchWikipedia } from "../react/extra-tools";

// Search Grounding to najdroższa funkcja API — domyślnie wyłączona (L06/W0).
if (process.env.ENABLE_SEARCH_GROUNDING === "true") {
  console.warn(
    "⚠️ UWAGA: Search Grounding jest WŁĄCZONY. " +
      "To jest najdroższa funkcja API ($14/1000 zapytań). Używaj TYLKO do testów.",
  );
}

const SYSTEM_PROMPT = `Jesteś analitykiem konkurencji. Gdy użytkownik poda nazwy firm, AUTONOMICZNIE zbierasz informacje i porównujesz je.

## TWÓJ PROCES:
1. Dla KAŻDEJ firmy szukaj informacji (Wikipedia, strony firmowe).
2. Zbierz: opis, branża, wielkość, produkty, ceny, mocne/słabe strony.
3. Stwórz tabelę porównawczą.
4. Napisz rekomendację — uwzględnij kontekst użytkownika, jeśli go podał.

## FORMAT (czysty markdown):

# 🏢 Analiza konkurencji

## Porównanie

| Aspekt | [Firma 1] | [Firma 2] | [Firma 3] |
|--------|-----------|-----------|-----------|
| Branża | ... | ... | ... |
| Wielkość | ... | ... | ... |
| Główny produkt | ... | ... | ... |
| Mocne strony | ... | ... | ... |
| Słabe strony | ... | ... | ... |
| Ceny (orientacyjne) | ... | ... | ... |

## Szczegółowa analiza
[Rozwinięcie dla każdej firmy — 3-4 zdania]

## Rekomendacja
[Która firma jest najlepsza i dlaczego — w kontekście użytkownika]

## Źródła
[Linki do stron firmowych i artykułów]

ZASADY:
- Opieraj się na danych z narzędzi — nie zmyślaj. Gdy czegoś nie wiesz, oznacz to.
- Bądź konkretny: liczby, nazwy produktów, przedziały cenowe.
- Język: polski.`;

export async function POST(req: Request) {
  const {
    companies,
    context,
  }: { companies?: string[]; context?: string } = await req.json();

  const names = (companies ?? []).map((c) => (c ?? "").trim()).filter(Boolean);
  if (names.length < 2) {
    return Response.json(
      { error: "Podaj co najmniej 2 firmy do porównania." },
      { status: 400 },
    );
  }

  const groundingEnabled = process.env.ENABLE_SEARCH_GROUNDING === "true";
  // Gemini nie łączy google_search z własnymi narzędziami — wybieramy jedno.
  const tools: ToolSet = groundingEnabled
    ? { google_search: google.tools.googleSearch({}) }
    : { readWebPage, searchWikipedia };

  const prompt =
    `Porównaj następujące firmy: ${names.join(", ")}.` +
    (context?.trim() ? `\n\nKontekst użytkownika: ${context.trim()}` : "");

  const result = streamText({
    model: google("gemini-3.1-flash-lite"),
    system: SYSTEM_PROMPT,
    prompt,
    tools,
    stopWhen: stepCountIs(10),
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    maxRetries: 1,
  });

  return result.toTextStreamResponse();
}
