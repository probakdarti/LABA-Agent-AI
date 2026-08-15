// ─────────────────────────────────────────────────────────────────────────────
// Budżet kosztów (Lekcja 10, Warsztat 3) — kontrola zużycia tokenów.
//
//   • Każde wywołanie LLM loguje zużycie tokenów do tabeli Supabase `api_usage`.
//   • Przed wywołaniem sprawdzamy dzienny limit (DAILY_TOKEN_LIMIT) per user.
//   • Po przekroczeniu → "Wróć jutro".
//
// Bez budżetu jeden użytkownik może wygenerować ogromny rachunek — to podstawowa
// funkcja produkcyjna.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";

/** Dzienny limit tokenów per użytkownik. Obniż do np. 100 na czas testu. */
export const DAILY_TOKEN_LIMIT = 10_000;

/** Komunikat po wyczerpaniu dziennego limitu. */
export const BUDGET_MESSAGE =
  "🪙 Dzienny limit tokenów (10k) został wyczerpany. Wróć jutro!";

// Początek bieżącego dnia w UTC (reset limitu o północy UTC).
function startOfTodayISO(): string {
  return new Date().toISOString().slice(0, 10) + "T00:00:00.000Z";
}

export type BudgetCheck =
  | { ok: true; used: number }
  | { ok: false; used: number };

/**
 * Sumuje tokeny użytkownika z dzisiejszego dnia i porównuje z limitem.
 * "Fail-open": gdy tabela zawiedzie, NIE blokujemy użytkownika.
 */
export async function checkDailyBudget(userId: string): Promise<BudgetCheck> {
  const { data, error } = await supabase
    .from("api_usage")
    .select("tokens_input, tokens_output")
    .eq("user_id", userId)
    .gte("created_at", startOfTodayISO());

  if (error) {
    console.warn("[BUDGET] błąd odczytu zużycia:", error.message);
    return { ok: true, used: 0 };
  }

  const used = (data ?? []).reduce(
    (sum, r) => sum + (r.tokens_input ?? 0) + (r.tokens_output ?? 0),
    0,
  );

  return used >= DAILY_TOKEN_LIMIT ? { ok: false, used } : { ok: true, used };
}

/** Zapisuje zużycie tokenów pojedynczego wywołania LLM. */
export async function logUsage(params: {
  userId: string;
  email?: string | null;
  tokensInput: number;
  tokensOutput: number;
  model: string;
  endpoint: string;
}): Promise<void> {
  const { error } = await supabase.from("api_usage").insert({
    user_id: params.userId,
    email: params.email ?? null,
    tokens_input: params.tokensInput,
    tokens_output: params.tokensOutput,
    model: params.model,
    endpoint: params.endpoint,
  });
  if (error) console.warn("[BUDGET] błąd zapisu zużycia:", error.message);
}
