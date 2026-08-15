import { respondWithModelRouting, lastUserText } from "../model-router";
import { type UIMessage } from "ai";
import {
  fetchUserContext,
  personalizationPrompt,
  userProfileTools,
} from "./personalization";
import {
  validateInput,
  checkRateLimit,
  logMessage,
  staticMessageResponse,
  BLOCK_MESSAGE,
} from "@/lib/defense";
import { checkDailyBudget, BUDGET_MESSAGE } from "@/lib/usage";

// ── Profesjonalna persona (Lekcja 2, Warsztat 1) ─────────────────────────────
const SYSTEM_PROMPT = `# VERMI — PM ASSISTANT (Asystent ds. zarządzania projektami)

## KIM JESTEM
Jestem doświadczonym Project Managerem z 8-letnim doświadczeniem w prowadzeniu projektów IT i wdrożeniowych.
Specjalizuję się w metodykach zwinnych (Agile/Scrum), zarządzaniu ryzykiem oraz planowaniu i harmonogramowaniu.
Pracowałem z zespołami produktowymi, firmami wdrażającymi systemy (ERP/CRM) oraz startupami i korporacjami.

## JAK ODPOWIADAM

### Struktura każdej odpowiedzi:
1. 📋 **Kontekst** — potwierdzam zrozumienie pytania (1 zdanie)
2. 🔍 **Analiza** — merytoryczna odpowiedź (max 2 akapity)
3. ✅ **Rekomendacja** — konkretne działanie do podjęcia (1-3 punkty)
4. ❓ **Pytanie** — jedno pytanie pogłębiające do użytkownika

### Zasady:
- ZANIM odpowiem na złożone pytanie — pytam o kontekst, jeśli go brakuje
- Gdy podaję fakty — oznaczam pewność: ✓ pewne, ~ przybliżone, ? do weryfikacji
- **Pogrubiam** kluczowe terminy przy pierwszym użyciu
- Używam list numerowanych dla kroków, punktowanych dla opcji
- Maksymalnie 3 akapity + rekomendacja

### Styl:
- Język: polski
- Ton: profesjonalny, ale przystępny
- Gdy używam terminu branżowego — wyjaśniam go krótko w nawiasie

## PAMIĘĆ
- Pamiętasz CAŁĄ rozmowę od początku i nawiązujesz do wcześniejszych wiadomości
- Jeśli użytkownik podał imię — używaj go konsekwentnie
- Gdy użytkownik napisze "podsumuj" lub "co ustaliliśmy" — streść rozmowę w numerowanej liście
  (główne tematy → kluczowe ustalenia → co jeszcze mogę pomóc)

## CZEGO NIE ROBIĘ
- Nie odpowiadam na pytania spoza zarządzania projektami — mówię wprost: "To nie moja specjalizacja, ale mogę pomóc z zarządzaniem projektami" i proponuję, co MOGĘ zrobić
- Nie udaję, że wiem coś, czego nie wiem
- Nie udzielam porad prawnych, medycznych ani finansowych — odsyłam do specjalisty`;

export async function POST(req: Request) {
  const {
    messages,
    userId,
    userEmail,
  }: { messages: UIMessage[]; userId?: string; userEmail?: string } =
    await req.json();

  // ── Obrona wielowarstwowa (L10/W2) ─────────────────────────────────────────
  const rateKey = userId ?? "anonymous";
  const email = userEmail ?? null;
  const userText = lastUserText(messages);

  // WARSTWA 1 — walidacja wejścia (długość / blacklista / sanityzacja).
  const check = validateInput(userText);
  if (!check.ok) {
    console.warn(`[VERMI] 🛡️ Zablokowano wejście (${rateKey}): ${check.reason}`);
    // Log do panelu bezpieczeństwa (L10/W4): zapisujemy zablokowaną próbę.
    await logMessage({
      userId: rateKey,
      email,
      length: userText.length,
      blocked: true,
      reason: check.reason,
      content: userText,
    });
    return staticMessageResponse(BLOCK_MESSAGE);
  }

  // WARSTWA 3 — rate limiting per użytkownik (50/h).
  const rate = await checkRateLimit(rateKey);
  if (!rate.ok) {
    console.warn(`[VERMI] 🛡️ Limit wiadomości (${rateKey}): ${rate.count}/h`);
    return staticMessageResponse(
      `⏱️ Osiągnąłeś limit wiadomości (50/h). Spróbuj ponownie za ${rate.retryMinutes} min.`,
    );
  }
  // Zapisujemy wpis dopiero, gdy wiadomość przeszła walidację.
  await logMessage({ userId: rateKey, email, length: check.clean.length });

  // BUDŻET (L10/W3) — dzienny limit tokenów per użytkownik.
  const budget = await checkDailyBudget(rateKey);
  if (!budget.ok) {
    console.warn(`[VERMI] 🪙 Limit tokenów (${rateKey}): ${budget.used} tokenów dziś`);
    return staticMessageResponse(BUDGET_MESSAGE);
  }

  // Personalizacja (W3): dociągamy profil i dopisujemy kontekst do promptu.
  const userContext = await fetchUserContext(userId);
  const system = SYSTEM_PROMPT + personalizationPrompt(userContext);
  const tools = userProfileTools(userId);

  return respondWithModelRouting({
    req,
    system,
    messages,
    tools,
    logPrefix: "VERMI",
    redactOutput: true, // WARSTWA 2 — filtr wyjścia (L10/W2)
    usageContext: { userId: rateKey, email, endpoint: "/api/chat" }, // budżet (L10/W3)
  });
}
