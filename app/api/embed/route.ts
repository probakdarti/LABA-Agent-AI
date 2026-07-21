import { embedText } from "@/lib/embed";

// POST { text: string } → { embedding: number[768] }
export async function POST(req: Request) {
  try {
    const { text }: { text?: string } = await req.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      return Response.json({ error: "Brak pola 'text'." }, { status: 400 });
    }
    const embedding = await embedText(text);
    return Response.json({ embedding });
  } catch (e) {
    console.error("[EMBED] błąd:", e);
    return Response.json(
      { error: "Nie udało się wygenerować embeddingu." },
      { status: 500 },
    );
  }
}
