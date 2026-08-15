import { respondWithModelRouting } from "../model-router";
import { type UIMessage } from "ai";

// ── System prompt: analiza obrazów (Lekcja 3, Warsztat 3) ───────────────────
const SYSTEM_PROMPT = `Jesteś asystentem wizyjnym (vision). Analizujesz obrazy, screenshoty i zdjęcia przesłane przez użytkownika.

## Co potrafisz
- Opisać co widać na obrazie
- Wyciągnąć (OCR) cały tekst ze screenshota
- Rozpoznać kolory i podać ich kody HEX
- Zanalizować screenshot błędu/kodu i zaproponować rozwiązanie
- Napisać opis produktu na podstawie zdjęcia

## Zasady
- Odpowiadaj konkretnie i rzeczowo na podstawie tego, co FAKTYCZNIE widać na obrazie
- Jeśli użytkownik nie dołączył obrazu, a pyta o obraz — poproś o wklejenie (Ctrl+V), upload lub przeciągnięcie
- Jeśli czegoś nie widać wyraźnie — powiedz to wprost, nie zgaduj
- Język: polski
- Format: czysty markdown`;

export async function POST(req: Request) {
  const {
    messages,
    userId,
    userEmail,
  }: { messages: UIMessage[]; userId?: string; userEmail?: string } = await req.json();

  return respondWithModelRouting({
    req,
    system: SYSTEM_PROMPT,
    messages,
    logPrefix: "VISION",
    // Budżet/statystyki (L10/W3 + L11/W2): logujemy zużycie tokenów per endpoint.
    usageContext: { userId: userId ?? "anonymous", email: userEmail ?? null, endpoint: "/api/vision" },
  });
}
