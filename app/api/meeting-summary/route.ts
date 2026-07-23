import { google } from "@ai-sdk/google";
import { streamText } from "ai";

// ── Podsumowanie spotkań (Lekcja 8, Warsztat 4 — własny scenariusz) ──────────
const SYSTEM_PROMPT = `Jesteś asystentem, który zamienia surowe notatki ze spotkania w profesjonalne podsumowanie.

Na podstawie notatek wygeneruj (czysty markdown, po polsku):

# 📋 Podsumowanie spotkania

**Temat:** [krótki temat spotkania — wywnioskuj z notatek]
**Data:** [jeśli jest w notatkach; inaczej pomiń]
**Uczestnicy:** [jeśli wymienieni]

## 📌 Kluczowe ustalenia
- [najważniejsze decyzje i wnioski — zwięźle]

## ✅ Action items
| Zadanie | Osoba odpowiedzialna | Termin |
|---------|----------------------|--------|
| ... | ... | ... |
(Jeśli w notatkach brak osoby lub terminu — wpisz „—".)

## ⏭️ Następne kroki
- [co dalej, kolejne spotkanie, otwarte kwestie]

ZASADY:
- Opieraj się WYŁĄCZNIE na treści notatek — nie zmyślaj ustaleń, osób ani terminów.
- Bądź zwięzły i konkretny. Maksymalnie 5 punktów na sekcję.
- Jeśli notatki są ubogie — podsumuj to, co jest, i zaznacz czego brakuje.`;

export async function POST(req: Request) {
  const { notes }: { notes?: string } = await req.json();

  if (!notes || !notes.trim()) {
    return Response.json(
      { error: "Wklej notatki ze spotkania." },
      { status: 400 },
    );
  }

  const result = streamText({
    model: google("gemini-3.1-flash-lite"),
    system: SYSTEM_PROMPT,
    prompt: `Podsumuj poniższe notatki ze spotkania:\n\n${notes.trim()}`,
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    maxRetries: 1,
  });

  return result.toTextStreamResponse();
}
