import { tool } from "ai";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { embedText } from "@/lib/embed";

export type KnowledgeResult = {
  title: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
  added_at: string | null;
};

export type KnowledgeSearch = {
  results: KnowledgeResult[];
  total_found: number;
  source_documents: string[];
  message?: string;
};

/**
 * Rdzeń RAG — embeduje pytanie (RETRIEVAL_QUERY) i szuka w tabeli documents
 * przez funkcję match_documents (W1). Współdzielone przez narzędzie agenta
 * i endpoint testowy /api/knowledge-search (strona /knowledge).
 */
export async function retrieveKnowledge(
  query: string,
  {
    threshold = 0.5,
    count = 5,
    userId,
  }: { threshold?: number; count?: number; userId?: string } = {},
): Promise<KnowledgeSearch> {
  try {
    const embedding = await embedText(query, "RETRIEVAL_QUERY");

    // filter_user_id ogranicza wyszukiwanie do dokumentów zalogowanego użytkownika (W3).
    const { data, error } = await supabase.rpc("match_documents", {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: count,
      filter_user_id: userId ?? null,
    });
    if (error) {
      return {
        results: [],
        total_found: 0,
        source_documents: [],
        message: `Błąd wyszukiwania w bazie wiedzy: ${error.message}`,
      };
    }

    const rows = (data ?? []) as {
      title: string;
      content: string;
      similarity: number;
      metadata: Record<string, unknown> | null;
    }[];

    if (rows.length === 0) {
      return {
        results: [],
        total_found: 0,
        source_documents: [],
        message: "Nie znaleziono informacji w bazie wiedzy.",
      };
    }

    // Data dodania (added_at) per dokument — jedno dodatkowe zapytanie.
    const titles = [...new Set(rows.map((r) => r.title))];
    const { data: dateRows } = await supabase
      .from("documents")
      .select("title, created_at")
      .in("title", titles)
      .order("created_at", { ascending: true });
    const addedAt = new Map<string, string>();
    for (const d of dateRows ?? []) {
      if (!addedAt.has(d.title as string)) {
        addedAt.set(d.title as string, (d.created_at as string).slice(0, 10));
      }
    }

    const results: KnowledgeResult[] = rows.map((r) => ({
      title: r.title,
      content: r.content,
      similarity: r.similarity,
      metadata: r.metadata ?? {},
      added_at: addedAt.get(r.title) ?? null,
    }));

    return { results, total_found: results.length, source_documents: titles };
  } catch (e) {
    console.error("[retrieveKnowledge] błąd:", e);
    return {
      results: [],
      total_found: 0,
      source_documents: [],
      message: "Nie udało się przeszukać bazy wiedzy.",
    };
  }
}

// RAG jako narzędzie agenta (W3 + W4). Fabryka domyka userId → wyszukiwanie
// tylko w dokumentach zalogowanego użytkownika (izolacja danych).
export function makeSearchKnowledge(userId: string | undefined) {
  return tool({
    description:
      "Wyszukuje informacje w bazie wiedzy firmy (cenniki, FAQ, regulaminy, oferty). " +
      "Używaj ZAWSZE gdy użytkownik pyta o: ceny, pakiety, koszty; procedury, regulaminy, " +
      "warunki; FAQ; pytania o firmę/usługi; cokolwiek co może być w dokumentach firmowych. " +
      "Wynik zawiera source_documents — użyj ich do zacytowania źródła (📎 Źródło: ...).",
    inputSchema: z.object({
      query: z
        .string()
        .describe("Pytanie użytkownika, np. 'ile kosztuje pakiet premium'"),
    }),
    execute: async ({ query }) => retrieveKnowledge(query, { userId }),
  });
}
