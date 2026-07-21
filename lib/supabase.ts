import { createClient } from "@supabase/supabase-js";

// Klient Supabase używany po stronie przeglądarki (klucz publiczny/anon).
// Zmienne pochodzą z .env.local — muszą mieć prefiks NEXT_PUBLIC_,
// żeby Next.js udostępnił je w kodzie klienckim.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Czytelny błąd zamiast cichego "undefined" przy pierwszym zapytaniu.
  throw new Error(
    "Brak NEXT_PUBLIC_SUPABASE_URL lub NEXT_PUBLIC_SUPABASE_ANON_KEY w .env.local",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── Typy pomocnicze odpowiadające tabelom z W1 ──────────────────────────────
export type ConversationRow = {
  id: string;
  created_at: string;
  title: string | null;
  updated_at: string;
};

export type MessageRow = {
  id: string;
  created_at: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
};
