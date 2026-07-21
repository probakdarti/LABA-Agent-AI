import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { supabase } from "@/lib/supabase";

// Profil użytkownika potrzebny do personalizacji (imię + preferencje z JSONB).
export type UserContext = {
  name: string | null;
  preferences: Record<string, unknown>;
};

/**
 * Pobiera profil użytkownika z tabeli user_profiles po ID z localStorage.
 * Zwraca null, gdy userId nie podano lub profil nie istnieje.
 */
export async function fetchUserContext(
  userId: string | undefined,
): Promise<UserContext | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("user_profiles")
    .select("name, preferences")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[VERMI] Nie udało się pobrać profilu:", error.message);
    return null;
  }
  if (!data) return null;
  return {
    name: (data.name as string | null) ?? null,
    preferences: (data.preferences as Record<string, unknown>) ?? {},
  };
}

/**
 * Buduje dopisek do system promptu na podstawie profilu użytkownika.
 * - znane imię  → agent wita po imieniu i jest personalny,
 * - brak imienia → agent przedstawia się i pyta o imię (i zapisuje je narzędziem).
 */
export function personalizationPrompt(ctx: UserContext | null): string {
  if (!ctx) return "";

  const prefsKnown = Object.keys(ctx.preferences).length > 0;
  const prefsLine = prefsKnown
    ? `\nZnane preferencje użytkownika (JSON): ${JSON.stringify(ctx.preferences)}. ` +
      `Wplataj je naturalnie w rozmowę, gdy są istotne.`
    : "";

  if (ctx.name) {
    return (
      `\n\n## UŻYTKOWNIK\n` +
      `Użytkownik ma na imię **${ctx.name}**. Zwracaj się do niego po imieniu. ` +
      `Bądź ciepły i personalny — to Twój stały użytkownik.` +
      `\nGdy użytkownik zdradzi nową preferencję (np. ulubione jedzenie, miasto, hobby), ` +
      `zapisz ją narzędziem saveUserPreference.` +
      prefsLine
    );
  }

  return (
    `\n\n## UŻYTKOWNIK\n` +
    `To nowy użytkownik — jeszcze nie znasz jego imienia. ` +
    `Na początku pierwszej rozmowy krótko się przedstaw i zapytaj, jak ma na imię. ` +
    `W chwili gdy poda imię — natychmiast wywołaj narzędzie saveUserName, żeby je zapamiętać. ` +
    `Gdy zdradzi jakąś preferencję, użyj saveUserPreference.` +
    prefsLine
  );
}

// Serializacja zapisów preferencji. Model potrafi wywołać kilka saveUserPreference
// RÓWNOLEGLE w jednym kroku; ponieważ scalamy JSONB metodą read-modify-write,
// równoległe zapisy nadpisywałyby się nawzajem (ostatni wygrywa). Łańcuch obietnic
// wymusza kolejność: każdy kolejny zapis czyta już wynik poprzedniego.
let preferenceWriteChain: Promise<unknown> = Promise.resolve();
function withPreferenceLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = preferenceWriteChain.then(fn, fn);
  preferenceWriteChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Narzędzia personalizacji związane z konkretnym userId (przez domknięcie).
 * Zwraca undefined, gdy userId nie podano (wtedy route działa bez narzędzi).
 */
export function userProfileTools(userId: string | undefined): ToolSet | undefined {
  if (!userId) return undefined;

  const saveUserName = tool({
    description:
      "Zapisuje IMIĘ użytkownika w jego profilu. Wywołaj natychmiast, gdy użytkownik poda " +
      "swoje imię (np. 'mam na imię Paweł', 'jestem Anna', 'nazywam się Kuba').",
    inputSchema: z.object({
      name: z.string().describe("Samo imię użytkownika, np. 'Paweł'"),
    }),
    execute: async ({ name }) => {
      const clean = name.trim();
      if (!clean) return { error: "Puste imię — nic nie zapisano." };
      const { error } = await supabase
        .from("user_profiles")
        .update({ name: clean })
        .eq("id", userId);
      if (error) return { error: error.message };
      return { saved: true, name: clean };
    },
  });

  const saveUserPreference = tool({
    description:
      "Zapisuje pojedynczą PREFERENCJĘ użytkownika do profilu (dopisuje do JSONB, nie nadpisuje " +
      "reszty). Używaj, gdy użytkownik zdradza gust lub fakt o sobie. " +
      "Przykłady: 'Lubię pizzę' → key='ulubione_jedzenie', value='pizza'; " +
      "'Mieszkam w Krakowie' → key='miasto', value='Kraków'.",
    inputSchema: z.object({
      key: z
        .string()
        .describe("Klucz preferencji w snake_case, np. 'ulubione_jedzenie', 'miasto', 'hobby'"),
      value: z.string().describe("Wartość preferencji, np. 'pizza', 'Kraków', 'narty'"),
    }),
    execute: async ({ key, value }) =>
      // Cały read-modify-write pod blokadą — bezpieczny przy równoległych wywołaniach.
      withPreferenceLock(async () => {
        const { data, error: readErr } = await supabase
          .from("user_profiles")
          .select("preferences")
          .eq("id", userId)
          .maybeSingle();
        if (readErr) return { error: readErr.message };

        const current = (data?.preferences as Record<string, unknown>) ?? {};
        const merged = { ...current, [key]: value };

        const { error: writeErr } = await supabase
          .from("user_profiles")
          .update({ preferences: merged })
          .eq("id", userId);
        if (writeErr) return { error: writeErr.message };
        return { saved: true, key, value };
      }),
  });

  return { saveUserName, saveUserPreference };
}
