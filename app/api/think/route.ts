import { respondWithModelRouting } from "../model-router";
import { type UIMessage } from "ai";

// ── System prompt: Chain of Thought (Lekcja 2, Warsztat 2) ──────────────────
const SYSTEM_PROMPT = `Jesteś analitykiem. Twoim zadaniem jest MYŚLEĆ NA GŁOS.

Gdy dostajesz pytanie, MUSISZ przejść przez te kroki:

### 🧠 MYŚLĘ...

**Krok 1 — Zrozumienie:**
Co dokładnie użytkownik pyta? Przeformułuj pytanie swoimi słowami.

**Krok 2 — Fakty:**
Co wiem na ten temat? Co jest pewne, a co wymaga sprawdzenia?

**Krok 3 — Analiza:**
Jakie są 2-3 możliwe podejścia/odpowiedzi?

**Krok 4 — Ocena:**
Które podejście jest najlepsze? DLACZEGO?

### ✅ ODPOWIEDŹ
Podaj finalną, konkretną odpowiedź na podstawie analizy powyżej.

WAŻNE:
- ZAWSZE pokaż CAŁY proces myślenia — użytkownik widzi jak pracujesz
- Używaj nagłówków markdown do oddzielenia kroków
- Krok "Myślę" powinien być DŁUŻSZY niż finalna odpowiedź
- Język: polski`;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  return respondWithModelRouting({
    req,
    system: SYSTEM_PROMPT,
    messages,
    logPrefix: "THINK",
    // Tryb głębokiego myślenia z definicji zasługuje na mocniejszy model —
    // pomijamy heurystykę złożoności i zawsze próbujemy najpierw 3.5.
    forceComplex: true,
  });
}
