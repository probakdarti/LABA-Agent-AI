import { splitIntoChunks } from "@/lib/chunking";
import { embedText } from "@/lib/embed";
import { supabase } from "@/lib/supabase";

// POST { title, content } → strumień NDJSON z postępem:
//   {"type":"progress","current":3,"total":12}
//   {"type":"done","chunks_saved":12}
//   {"type":"error","error":"..."}
// Chunki przetwarzane SEKWENCYJNIE (rate limit API embeddingów).
export async function POST(req: Request) {
  const { title, content }: { title?: string; content?: string } =
    await req.json();

  if (!title?.trim() || !content?.trim()) {
    return Response.json(
      { error: "Wymagane pola: title oraz content." },
      { status: 400 },
    );
  }

  const chunks = splitIntoChunks(content);
  const total = chunks.length;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        if (total === 0) {
          send({ type: "done", chunks_saved: 0 });
          return;
        }
        let saved = 0;
        for (let i = 0; i < total; i++) {
          send({ type: "progress", current: i + 1, total });
          const embedding = await embedText(chunks[i]);
          const { error } = await supabase.from("documents").insert({
            title: title.trim(),
            content: chunks[i],
            embedding,
            metadata: {
              source: title.trim(),
              chunk_index: i,
              total_chunks: total,
            },
          });
          if (error) throw new Error(error.message);
          saved++;
        }
        send({ type: "done", chunks_saved: saved });
      } catch (e) {
        console.error("[UPLOAD-KNOWLEDGE] błąd:", e);
        send({
          type: "error",
          error:
            e instanceof Error ? e.message : "Nie udało się zapisać dokumentu.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
