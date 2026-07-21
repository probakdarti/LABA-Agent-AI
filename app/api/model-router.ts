import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type ToolSet,
  type UIMessage,
} from "ai";

// ── Model Gemini (ten sam klucz API) ─────────────────────────────────────────
// Optymalizacja kosztów (L06/W0): całe API korzysta z jednego, najtańszego modelu.
// Nazwy FAST/RESERVE/SMART zostawiamy dla zgodności z łańcuchami fallbacku —
// wszystkie wskazują ten sam model (kolejne próby = retry przy błędzie 503).
export const MODEL_FAST = "gemini-3.1-flash-lite";
export const MODEL_RESERVE = "gemini-3.1-flash-lite";
export const MODEL_SMART = "gemini-3.1-flash-lite";

// Ile czasu model ma na ROZPOCZĘCIE odpowiedzi, zanim przełączymy się na kolejny.
// (Gdy treść już płynie — pozwalamy dokończyć bez limitu.)
const STARTUP_TIMEOUT_MS = 15_000;
const STARTUP_TIMEOUT_LAST_MS = 30_000;

/**
 * Ocenia złożoność ostatniego pytania użytkownika.
 */
export function classifyComplexity(text: string): "prosty" | "zlozony" {
  const t = text.toLowerCase().trim();
  const wordCount = t ? t.split(/\s+/).length : 0;

  const complexKeywords = [
    "przeanalizuj", "analiz", "porówn", "strategi", "zaplanuj", "plan ",
    "harmonogram", "ryzyk", "scenariusz", "optymaliz", "krok po kroku",
    "dlaczego", "wyjaśnij", "uzasadnij", "rekomendacj", "oceń", "zaproponuj",
    "kompleksow", "budżet", "roadmap", "zależnoś", "metodyk", "wdrożen",
    "co ustaliliśmy", "podsumuj",
  ];
  const hasComplexKeyword = complexKeywords.some((k) => t.includes(k));

  const simpleWords = ["cześć", "hej", "siema", "dzięki", "dziękuję", "ok", "spoko", "elo", "witaj"];
  const isShortGreeting = wordCount <= 4 && simpleWords.some((g) => t.includes(g));

  if (isShortGreeting) return "prosty";
  if (hasComplexKeyword) return "zlozony";
  if (t.length > 180 || wordCount > 30) return "zlozony";
  if ((t.match(/\?/g) || []).length >= 2) return "zlozony";

  return "prosty";
}

export function lastUserText(messages: UIMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "";
  return lastUser.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join(" ");
}

/**
 * "Podgląda" początek strumienia z twardym limitem czasu na START:
 * - błąd modelu (np. limit) → wyjątek → fallback na kolejny model,
 * - brak treści w `startupMs` → abort + wyjątek → fallback (kluczowe przy wolnym 3.5),
 * - treść zaczyna płynąć → odtwarza strumień od początku (nic nie ginie, bez dalszego limitu).
 */
async function startModelStream<T extends { type: string }>(
  uiStream: ReadableStream<T>,
  onStartupTimeout: () => void,
  startupMs: number,
): Promise<ReadableStream<T>> {
  const reader = uiStream.getReader();
  const buffered: T[] = [];
  let sawContent = false;
  const deadline = Date.now() + startupMs;

  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      onStartupTimeout();
      await reader.cancel().catch(() => {});
      throw new Error(`Model nie rozpoczął odpowiedzi w ${startupMs / 1000}s.`);
    }

    let res: ReadableStreamReadResult<T>;
    try {
      // Wyścig: odczyt vs. deadline startu
      res = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("__startup_timeout__")), remaining),
        ),
      ]);
    } catch (err) {
      await reader.cancel().catch(() => {});
      if (err instanceof Error && err.message === "__startup_timeout__") {
        onStartupTimeout();
        throw new Error(`Model nie rozpoczął odpowiedzi w ${startupMs / 1000}s.`);
      }
      throw err; // błąd sieci / limitu przy starcie
    }

    if (res.done) {
      reader.releaseLock();
      if (!sawContent) throw new Error("Strumień zamknięty bez treści (pusta odpowiedź).");
      break;
    }

    const chunk = res.value;
    if (chunk.type === "error") {
      await reader.cancel().catch(() => {});
      throw new Error("Model zwrócił błąd (prawdopodobnie limit).");
    }
    if (chunk.type === "text-delta" || chunk.type === "reasoning-delta") sawContent = true;
    buffered.push(chunk);
    if (sawContent) break;
    if (chunk.type === "finish") {
      await reader.cancel().catch(() => {});
      throw new Error("Model zakończył strumień bez treści (pusta odpowiedź).");
    }
  }

  return new ReadableStream<T>({
    start(controller) {
      for (const c of buffered) controller.enqueue(c);
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          reader.releaseLock();
        } else {
          controller.enqueue(value);
        }
      } catch (err) {
        controller.error(err);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

/**
 * Wspólny mechanizm dla wszystkich endpointów czatu.
 *
 * Po optymalizacji kosztów (L06/W0) używamy jednego, najtańszego modelu
 * (gemini-3.1-flash-lite) na każdej próbie łańcucha. Do tego:
 * - wyłączamy wewnętrzne "myślenie" (thinkingBudget: 0) → niższa latencja i mniej tokenów,
 * - twardy timeout na START każdej próby → wolny model nie blokuje, tylko oddaje pole backupowi,
 * - kolejne próby w łańcuchu działają jak retry na wypadek błędu 503.
 */
export function respondWithModelRouting({
  req,
  system,
  messages,
  logPrefix,
  forceComplex,
  tools,
  maxSteps = 3,
  speed,
}: {
  req: Request;
  system: string;
  messages: UIMessage[];
  logPrefix: string;
  /** Gdy true — traktuje pytanie jako złożone (dłuższy łańcuch modeli). */
  forceComplex?: boolean;
  /** Narzędzia dostępne dla modelu. */
  tools?: ToolSet;
  /** Maksymalna liczba kroków (iteracji narzędzi). Domyślnie 3 (ochrona przed pętlami). */
  maxSteps?: number;
  /** "fast" — zadania agentowe: najszybszy model na start (lite → 2.5 → 3.5). */
  speed?: "fast";
}) {
  return (async () => {
    const modelMessages = await convertToModelMessages(messages, { tools });

    let modelsToTry: string[];
    let label: string;
    if (speed === "fast") {
      modelsToTry = [MODEL_RESERVE, MODEL_FAST, MODEL_SMART];
      label = "fast";
    } else {
      const complexity = forceComplex
        ? "zlozony"
        : classifyComplexity(lastUserText(messages));
      label = complexity;
      modelsToTry =
        complexity === "zlozony"
          ? [MODEL_FAST, MODEL_RESERVE, MODEL_SMART]
          : [MODEL_FAST, MODEL_RESERVE];
    }

    console.log(`[${logPrefix}] Tryb: ${label} | plan modeli: ${modelsToTry.join(" → ")}`);

    const stream = createUIMessageStream<UIMessage>({
      execute: async ({ writer }) => {
        let lastError: unknown;

        for (let i = 0; i < modelsToTry.length; i++) {
          const modelId = modelsToTry[i];
          const isLast = i === modelsToTry.length - 1;

          // Osobny AbortController na próbę (spięty z sygnałem klienta).
          const ac = new AbortController();
          const onAbort = () => ac.abort();
          req.signal.addEventListener("abort", onAbort);

          // Wyłączamy wewnętrzne "myślenie" modelu — szybsza odpowiedź i mniej tokenów.
          const providerOptions = {
            google: { thinkingConfig: { thinkingBudget: 0 } },
          };

          try {
            const result = streamText({
              model: google(modelId),
              system,
              messages: modelMessages,
              tools,
              stopWhen: tools ? stepCountIs(maxSteps) : undefined,
              maxRetries: 0, // nie czekamy na backoff — od razu przechodzimy do kolejnego modelu
              abortSignal: ac.signal,
              providerOptions,
            });

            const uiStream = toUIMessageStream({
              stream: result.fullStream,
              sendSources: true,
            });

            const safeStream = await startModelStream(
              uiStream,
              () => ac.abort(),
              isLast ? STARTUP_TIMEOUT_LAST_MS : STARTUP_TIMEOUT_MS,
            );

            console.log(`[${logPrefix}] Odpowiada model: ${modelId}`);
            writer.merge(safeStream);
            req.signal.removeEventListener("abort", onAbort);
            return; // sukces
          } catch (err) {
            req.signal.removeEventListener("abort", onAbort);
            lastError = err;
            console.warn(
              `[${logPrefix}] Model ${modelId} nie odpowiedział${isLast ? "" : " — przełączam na backup"}.`,
            );
          }
        }

        throw lastError ?? new Error("Brak dostępnego modelu.");
      },
      onError: (error) => {
        console.error(`[${logPrefix}] Błąd strumienia:`, error);
        return "Przepraszam, wszystkie modele są chwilowo niedostępne (limit / przeciążenie). Spróbuj ponownie za chwilę. ⏱️";
      },
    });

    return createUIMessageStreamResponse({
      stream,
      headers: {
        "x-vermi-plan": modelsToTry.join(","),
        "x-vermi-mode": label,
      },
    });
  })();
}
