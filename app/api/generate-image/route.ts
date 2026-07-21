import { generateImageData } from "./generate";

export async function POST(req: Request) {
  const { prompt }: { prompt?: string } = await req.json().catch(() => ({}));

  if (!prompt || !prompt.trim()) {
    return Response.json({ error: "Brak opisu obrazu (prompt)." }, { status: 400 });
  }

  const result = await generateImageData(prompt);

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  console.log(`[IMAGE] Obraz wygenerowany modelem: ${result.model}`);
  return Response.json(result);
}
