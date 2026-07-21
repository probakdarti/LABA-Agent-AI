import { tool } from "ai";
import { z } from "zod";

const MAX_CHARS = 3000;
const TIMEOUT_MS = 5000;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const readWebPage = tool({
  description:
    "Pobiera i czyta zawartość strony internetowej. Używaj gdy użytkownik poda URL " +
    "lub gdy chcesz przeczytać artykuł/stronę znalezioną w wyszukiwarce.",
  inputSchema: z.object({
    url: z.string().describe("Pełny adres URL strony do przeczytania"),
  }),
  execute: async ({ url }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; VermiSearchBot/1.0)" },
      });

      if (!res.ok) {
        return `Błąd: strona odpowiedziała kodem HTTP ${res.status} — nie udało się jej wczytać.`;
      }

      const html = await res.text();
      const text = stripHtml(html);

      if (!text) {
        return "Błąd: strona nie zawiera czytelnej treści tekstowej (może to strona wymagająca JavaScript).";
      }

      return text.slice(0, MAX_CHARS);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return `Błąd: strona nie odpowiedziała w ciągu ${TIMEOUT_MS / 1000} sekund (timeout).`;
      }
      return `Błąd: nie udało się pobrać strony (${err instanceof Error ? err.message : "nieznany błąd"}).`;
    } finally {
      clearTimeout(timeout);
    }
  },
});
