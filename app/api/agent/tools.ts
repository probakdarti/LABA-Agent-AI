import { google } from "@ai-sdk/google";
import { generateText, tool } from "ai";
import { z } from "zod";
import { generateImageData } from "../generate-image/generate";

// Search Grounding to najdroższa funkcja API — domyślnie wyłączona (L06/W0).
if (process.env.ENABLE_SEARCH_GROUNDING === "true") {
  console.warn(
    "⚠️ UWAGA: Search Grounding jest WŁĄCZONY. " +
      "To jest najdroższa funkcja API ($14/1000 zapytań). " +
      "Używaj TYLKO do testów. Wyłącz po testach usuwając ENABLE_SEARCH_GROUNDING z .env.local, " +
      "bo inni uczestnicy kursu mają wtedy ograniczony dostęp do modeli.",
  );
}

// ── 🧮 Kalkulator ────────────────────────────────────────────────────────────
export const calculator = tool({
  description:
    "Wykonuje obliczenia matematyczne. Podaj wyrażenie z liczbami i operatorami + - * / % ( ). " +
    "Używaj do VAT, procentów, sum, marż itp. Przykład VAT brutto z 8500: '8500 * 1.23'.",
  inputSchema: z.object({
    expression: z
      .string()
      .describe("Wyrażenie matematyczne, np. '8500 * 0.23' albo '(100 + 20) / 2'"),
  }),
  execute: async ({ expression }) => {
    // Bezpieczeństwo: dopuszczamy wyłącznie cyfry i operatory — żadnych identyfikatorów/funkcji
    // (blokuje import/require/eval/process itp., bo nie przejdą przez ten filtr).
    if (!/^[-+*/%.()0-9\s]+$/.test(expression)) {
      return { error: "Wyrażenie zawiera niedozwolone znaki (dozwolone: liczby oraz + - * / % ( ))." };
    }
    try {
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${expression});`)();
      if (typeof result !== "number" || !Number.isFinite(result)) {
        return { error: `Nie mogę obliczyć: ${expression}` };
      }
      return { expression, result };
    } catch {
      return { error: `Nie mogę obliczyć: ${expression}` };
    }
  },
});

// ── 🕐 Data i czas ───────────────────────────────────────────────────────────
export const currentDateTime = tool({
  description:
    "Zwraca aktualną datę i godzinę (strefa Europe/Warsaw). Używaj gdy pytanie dotyczy " +
    "'dziś', 'teraz', 'która godzina', 'jaki dziś dzień', 'ile dni do...'.",
  inputSchema: z.object({}),
  execute: async () => {
    const now = new Date();
    const pl = new Intl.DateTimeFormat("pl-PL", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Europe/Warsaw",
    }).format(now);
    return { iso: now.toISOString(), pl };
  },
});

// ── 🌐 Wyszukiwarka Google (grounding) ───────────────────────────────────────
// Jako WŁASNE narzędzie funkcyjne — wewnętrznie robi ugruntowane zapytanie do
// Gemini. Dzięki temu może współistnieć z innymi narzędziami funkcyjnymi
// (Gemini nie pozwala łączyć narzędzia dostawcy google_search z własnymi w jednym wywołaniu).
export const webSearch = tool({
  description:
    "Wyszukuje AKTUALNE informacje w internecie (Google). Używaj do newsów, cen, " +
    "wyników sportowych, bieżących faktów o firmach/osobach. NIE używaj do wiedzy ogólnej.",
  inputSchema: z.object({
    query: z.string().describe("Zapytanie do wyszukiwarki, po polsku lub angielsku"),
  }),
  execute: async ({ query }) => {
    // Płatna funkcja — domyślnie wyłączona. Bez env var nie wykonujemy zapytania.
    if (process.env.ENABLE_SEARCH_GROUNDING !== "true") {
      return {
        error:
          "Wyszukiwarka Google (Search Grounding) jest wyłączona dla oszczędności. " +
          "Aby ją włączyć, dodaj ENABLE_SEARCH_GROUNDING=true w .env.local. " +
          "Do czytania konkretnej strony użyj narzędzia readWebPage (darmowe).",
      };
    }
    try {
      const res = await generateText({
        model: google("gemini-3.1-flash-lite"),
        prompt: `Wyszukaj aktualne informacje i odpowiedz zwięźle po polsku na: ${query}`,
        tools: { google_search: google.tools.googleSearch({}) },
        maxRetries: 0,
      });
      const sources = res.sources
        .filter((s) => s.sourceType === "url")
        .map((s) => ({ url: s.url, title: s.title ?? s.url }));
      if (res.text) return { answer: res.text, sources };
      return { error: "Wyszukiwarka nie zwróciła wyniku." };
    } catch {
      return { error: "Wyszukiwarka chwilowo niedostępna (limit darmowego planu)." };
    }
  },
});

// ── 🎨 Generowanie obrazów ───────────────────────────────────────────────────
export const generateImage = tool({
  description:
    "Generuje obraz/logo/grafikę/ilustrację na podstawie opisu. Używaj gdy użytkownik " +
    "prosi o logo, grafikę, wizualizację, post wizualny lub ikonę.",
  inputSchema: z.object({
    prompt: z.string().describe("Szczegółowy opis obrazu do wygenerowania"),
  }),
  execute: async ({ prompt }) => generateImageData(prompt),
  // Do modelu wysyłamy tylko krótki status — base64 obrazu zostaje w UI, nie w kontekście modelu.
  toModelOutput: ({ output }) => {
    const o = output as { image?: string; error?: string };
    return {
      type: "text",
      value: o.error
        ? `Nie udało się wygenerować obrazu: ${o.error}`
        : "Obraz został wygenerowany i wyświetlony użytkownikowi w czacie.",
    };
  },
});
