import { retrieveKnowledge } from "../knowledge-tool";

// Testowa wyszukiwarka RAG (bez agenta) dla strony /knowledge.
// Niższy próg + więcej wyników niż w narzędziu agenta — do diagnostyki trafności.
export async function POST(req: Request) {
  try {
    const { query, userId }: { query?: string; userId?: string } =
      await req.json();
    if (!query || !query.trim()) {
      return Response.json({ error: "Brak pola 'query'." }, { status: 400 });
    }
    const res = await retrieveKnowledge(query, {
      threshold: 0.2,
      count: 10,
      userId,
    });
    return Response.json(res);
  } catch (e) {
    console.error("[KNOWLEDGE-SEARCH] błąd:", e);
    return Response.json(
      { error: "Nie udało się przeszukać bazy wiedzy." },
      { status: 500 },
    );
  }
}
