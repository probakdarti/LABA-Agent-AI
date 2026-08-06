// ─────────────────────────────────────────────────────────────────────────────
// Obrona wielowarstwowa (Lekcja 10, Warsztat 2) — "defense in depth".
//
// Trzy warstwy chroniące endpoint czatu:
//   1. WALIDACJA WEJŚCIA   — zanim wiadomość trafi do modelu (długość, blacklist,
//                            sanityzacja znaków kontrolnych / zero-width).
//   2. FILTR WYJŚCIA        — redakcja wrażliwych wzorców (klucze API, nazwy zmiennych,
//                            "system prompt") w strumieniu odpowiedzi modelu.
//   3. RATE LIMITING        — limit 50 wiadomości / godzinę per użytkownik
//                            (tabela Supabase `message_logs`).
//
// Żadna warstwa nie jest idealna — razem tworzą solidny mur.
// ─────────────────────────────────────────────────────────────────────────────

import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { supabase } from "@/lib/supabase";

// ═════════════════════════════════════════════════════════════════════════════
// WARSTWA 1 — Walidacja wejścia
// ═════════════════════════════════════════════════════════════════════════════

export const MAX_INPUT_CHARS = 2000;

/** Komunikat zwracany użytkownikowi, gdy wiadomość zostanie zablokowana. */
export const BLOCK_MESSAGE =
  "🛡️ Ta wiadomość została zablokowana z powodów bezpieczeństwa.";

// Frazy typowe dla prób prompt-injection / wyciągnięcia system promptu (patrz W1).
// Dopasowanie jest niewrażliwe na wielkość liter.
const INPUT_BLACKLIST = [
  // EN
  "ignore previous",
  "ignore all previous",
  "ignore instructions",
  "ignore your instructions",
  "system prompt",
  "reveal",
  "show me your",
  "translate your prompt",
  "repeat your instructions",
  // PL
  "zignoruj poprzednie",
  "zignoruj wszystkie",
  "zignoruj instrukcje",
  "pokaż swój prompt",
  "pokaż system prompt",
  "pokaż mi swój",
  "wyświetl swój prompt",
  "ujawnij",
  "powtórz swoje instrukcje",
];

// Znaki "niewidzialne" (zero-width space/joiner/non-joiner, BOM) — bywają używane
// do przemycania ukrytych instrukcji. Zapisane jawnymi escape'ami (czysty ASCII).
const ZERO_WIDTH = new RegExp("[\\u200B-\\u200D\\uFEFF]", "g");
// Znaki kontrolne C0 (z pominięciem \t \n \r) oraz DEL.
const CONTROL_CHARS = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]",
  "g",
);

/** Sanityzacja: usuwa znaki zero-width i kontrolne, przycina białe znaki. */
export function sanitize(text: string): string {
  return (text ?? "").replace(ZERO_WIDTH, "").replace(CONTROL_CHARS, "").trim();
}

export type InputCheck =
  | { ok: true; clean: string }
  | { ok: false; reason: string };

/** Sprawdza długość i blacklistę PO sanityzacji. */
export function validateInput(raw: string): InputCheck {
  const clean = sanitize(raw);

  if (clean.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      reason: `wiadomość za długa (${clean.length} > ${MAX_INPUT_CHARS} znaków)`,
    };
  }

  const lower = clean.toLowerCase();
  const hit = INPUT_BLACKLIST.find((phrase) => lower.includes(phrase));
  if (hit) {
    return { ok: false, reason: `wykryto niedozwoloną frazę: "${hit}"` };
  }

  return { ok: true, clean };
}

// ═════════════════════════════════════════════════════════════════════════════
// WARSTWA 2 — Filtr wyjścia (redakcja wrażliwych danych w strumieniu)
// ═════════════════════════════════════════════════════════════════════════════

// Wzorce, których model NIGDY nie powinien ujawnić w odpowiedzi.
const OUTPUT_PATTERNS: RegExp[] = [
  /google_generative_ai_api_key/gi,
  /supabase_service_role_key/gi,
  /next_public_supabase_url/gi,
  /next_public_supabase_anon_key/gi,
  /service[_-]?role[_-]?key/gi,
  /supabase_url/gi,
  /anon[_-]?key/gi,
  /api[_-]?key/gi,
  /cron_secret/gi,
  /system prompt/gi,
];

const REDACTION = "[usunięto ze względów bezpieczeństwa]";

// Najdłuższy możliwy wzorzec liczy ~30 znaków — trzymamy bufor bezpieczeństwa
// (tail), żeby wzorzec rozbity na granicy dwóch fragmentów strumienia też został
// wychwycony, zanim cokolwiek wyślemy do przeglądarki.
const HOLDBACK = 40;

/** Zastępuje wszystkie wrażliwe wzorce w gotowym fragmencie tekstu. */
export function redactText(text: string): string {
  let out = text;
  for (const re of OUTPUT_PATTERNS) out = out.replace(re, REDACTION);
  return out;
}

type TextChunk = { type: string; id?: string; delta?: string };

/**
 * Owija strumień "chunków" UI (z modelu) transformacją redagującą tekst.
 * Buforuje ostatnie HOLDBACK znaków każdej wiadomości, żeby wzorzec przecięty
 * na granicy fragmentów nie prześlizgnął się w połowie. Chunki inne niż tekst
 * (narzędzia, źródła, finish) przechodzą bez zmian.
 */
export function redactStream<T extends { type: string }>(
  source: ReadableStream<T>,
): ReadableStream<T> {
  const reader = source.getReader();
  const carry = new Map<string, string>();

  const releasable = (id: string): string => {
    const buf = carry.get(id) ?? "";
    if (buf.length <= HOLDBACK) return "";
    const release = buf.slice(0, buf.length - HOLDBACK);
    carry.set(id, buf.slice(buf.length - HOLDBACK));
    return redactText(release);
  };

  return new ReadableStream<T>({
    async pull(controller) {
      // Czytamy aż będziemy mieli COŚ do wypuszczenia (albo koniec strumienia).
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Domknięcie: dopchnij resztę wszystkich buforów (już zredagowaną).
          for (const [id, buf] of carry.entries()) {
            if (buf) {
              controller.enqueue({
                type: "text-delta",
                id,
                delta: redactText(buf),
              } as unknown as T);
            }
          }
          carry.clear();
          controller.close();
          return;
        }

        const chunk = value as unknown as TextChunk;

        if (chunk.type === "text-delta" && typeof chunk.id === "string") {
          carry.set(chunk.id, (carry.get(chunk.id) ?? "") + (chunk.delta ?? ""));
          const release = releasable(chunk.id);
          if (release) {
            controller.enqueue({ ...chunk, delta: release } as unknown as T);
            return;
          }
          continue; // za mało w buforze — czytaj dalej
        }

        if (chunk.type === "text-end" && typeof chunk.id === "string") {
          const rest = carry.get(chunk.id) ?? "";
          carry.delete(chunk.id);
          if (rest) {
            controller.enqueue({
              type: "text-delta",
              id: chunk.id,
              delta: redactText(rest),
            } as unknown as T);
          }
          controller.enqueue(value); // przekaż text-end
          return;
        }

        // text-start, tool-*, source-*, finish, error → bez zmian
        controller.enqueue(value);
        return;
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// WARSTWA 3 — Rate limiting per użytkownik (Supabase: message_logs)
// ═════════════════════════════════════════════════════════════════════════════

export const RATE_LIMIT_PER_HOUR = 50;

export type RateCheck =
  | { ok: true; count: number }
  | { ok: false; retryMinutes: number; count: number };

/**
 * Liczy wiadomości użytkownika z ostatniej godziny. Jeśli osiągnięto limit —
 * zwraca `ok:false` z liczbą minut do zwolnienia najstarszego wpisu.
 * "Fail-open": gdy tabela logów zawiedzie, NIE blokujemy użytkownika.
 */
export async function checkRateLimit(userId: string): Promise<RateCheck> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("message_logs")
    .select("created_at")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("[DEFENSE] rate-limit — błąd odczytu logów:", error.message);
    return { ok: true, count: 0 };
  }

  const count = data?.length ?? 0;
  if (count >= RATE_LIMIT_PER_HOUR) {
    const oldest = new Date(data![0].created_at).getTime();
    const elapsedMin = (Date.now() - oldest) / 60_000;
    const retryMinutes = Math.max(1, Math.ceil(60 - elapsedMin));
    return { ok: false, retryMinutes, count };
  }

  return { ok: true, count };
}

/**
 * Zapisuje wpis logu wiadomości (timestamp ustawia baza: default now()).
 * Dla wiadomości ZABLOKOWANYCH zapisujemy dodatkowo powód i skrócony podgląd
 * treści — zasila to panel bezpieczeństwa (L10/W4). Dla dozwolonych treści
 * NIE zapisujemy (prywatność) — liczy się tylko do rate-limitu.
 */
export async function logMessage(entry: {
  userId: string;
  email?: string | null;
  length: number;
  blocked?: boolean;
  reason?: string | null;
  content?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("message_logs").insert({
    user_id: entry.userId,
    email: entry.email ?? null,
    message_length: entry.length,
    blocked: entry.blocked ?? false,
    reason: entry.reason ?? null,
    content: entry.content ? entry.content.slice(0, 200) : null,
  });
  if (error) console.warn("[DEFENSE] rate-limit — błąd zapisu logu:", error.message);
}

// ═════════════════════════════════════════════════════════════════════════════
// Pomocnik: odpowiedź „statyczna" (bez wywołania modelu) w formacie strumienia UI,
// żeby zablokowany komunikat wyświetlił się w czacie jak zwykła odpowiedź.
// ═════════════════════════════════════════════════════════════════════════════

export function staticMessageResponse(text: string): Response {
  const stream = createUIMessageStream<UIMessage>({
    execute: ({ writer }) => {
      const id = "guard";
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
