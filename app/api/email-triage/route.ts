import { google } from "@ai-sdk/google";
import { streamText } from "ai";

// ── E-mail triage (Lekcja 8, Warsztat 1) ─────────────────────────────────────
const SYSTEM_PROMPT = `Jesteś profesjonalnym asystentem do zarządzania pocztą.

Dla KAŻDEGO maila wykonaj:
1. 📧 KATEGORYZACJA: określ typ (zapytanie ofertowe / reklamacja / spam / informacja / prośba o spotkanie)
2. PRIORYTET: 🔴 Wysoki (wymaga odpowiedzi dziś) / 🟡 Średni (w ciągu 3 dni) / 🟢 Niski (może poczekać). Spam oznacz jako 🗑️.
3. ✍️ DRAFT: Napisz krótki, profesjonalny szkic odpowiedzi (3-5 zdań). Dla spamu i newsletterów napisz "Brak odpowiedzi".

FORMAT ODPOWIEDZI (dokładnie, czysty markdown). Dla każdego maila:

### Mail [numer]: [krótki temat]

| Pole | Wartość |
|------|---------|
| Kategoria | [typ] |
| Priorytet | [🔴 Wysoki / 🟡 Średni / 🟢 Niski / 🗑️ Spam] |
| Uzasadnienie | [dlaczego ten priorytet] |

**Proponowana odpowiedź:**
> [draft odpowiedzi — lub "Brak odpowiedzi" dla spamu/newslettera]

---

Po wszystkich mailach dodaj sekcję:

### 📊 Podsumowanie
- 🔴 Pilne: [ile]
- 🟡 Średnie: [ile]
- 🟢 Niskie: [ile]
- 🗑️ Spam: [ile]
- ✅ Rekomendacja: [od którego maila zacząć i dlaczego]

Język: polski. Bądź zwięzły i konkretny.`;

export async function POST(req: Request) {
  const { emails }: { emails?: string[] } = await req.json();

  if (!Array.isArray(emails) || emails.length === 0) {
    return Response.json(
      { error: "Wymagane pole: emails (niepusta tablica tekstów maili)." },
      { status: 400 },
    );
  }

  const joined = emails
    .map((e, i) => `--- MAIL ${i + 1} ---\n${e.trim()}`)
    .join("\n\n");

  const result = streamText({
    model: google("gemini-3.1-flash-lite"),
    system: SYSTEM_PROMPT,
    prompt: `Przeanalizuj poniższe maile i posortuj je zgodnie z formatem:\n\n${joined}`,
    // Wyłączamy "myślenie" — szybciej i taniej (spójnie z resztą projektu).
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    maxRetries: 1,
  });

  return result.toTextStreamResponse();
}
