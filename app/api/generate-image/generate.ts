import { GoogleGenAI } from "@google/genai";

// Model obrazowy Gemini (Nano Banana) — tylko najtańszy wariant (L06/W0).
const IMAGE_MODELS = ["gemini-3.1-flash-lite-image"];

const TIMEOUT_MS = 30_000;

export type ImageResult =
  | { image: string; text: string; model: string }
  | { error: string };

/** Generuje obraz z opisu tekstowego. Współdzielone przez endpoint /api/generate-image i narzędzie generateImage. */
export async function generateImageData(prompt: string): Promise<ImageResult> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return { error: "Brak klucza API (GOOGLE_GENERATIVE_AI_API_KEY)." };

  const ai = new GoogleGenAI({ apiKey });
  let lastError = "";

  for (const model of IMAGE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseModalities: ["TEXT", "IMAGE"],
          abortSignal: AbortSignal.timeout(TIMEOUT_MS),
        },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      let image: string | null = null;
      let text = "";
      for (const part of parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || "image/png";
          image = `data:${mime};base64,${part.inlineData.data}`;
        } else if (part.text) {
          text += part.text;
        }
      }

      if (!image) {
        lastError = `Model ${model} nie zwrócił obrazu.`;
        continue;
      }
      return { image, text, model };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  const isQuota = /quota|RESOURCE_EXHAUSTED|429|limit: 0/i.test(lastError);
  return {
    error: isQuota
      ? "Generowanie obrazów jest niedostępne dla tego klucza (zerowy/wyczerpany limit darmowego planu Google AI Studio)."
      : `Nie udało się wygenerować obrazu: ${lastError}`,
  };
}
