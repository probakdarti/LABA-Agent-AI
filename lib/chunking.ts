// Dzielenie długiego tekstu na fragmenty (chunki) z zakładką (overlap),
// żeby nie tracić kontekstu na granicach. Prosty algorytm — bez ML.

/**
 * Dzieli tekst na fragmenty o rozmiarze ~chunkSize znaków, łącząc całe zdania.
 * Każdy kolejny fragment zaczyna się od `overlap` znaków ogona poprzedniego.
 */
export function splitIntoChunks(
  text: string,
  chunkSize = 300,
  overlap = 50,
): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  // 1) Podział na zdania: granice to . ! ? oraz nowe linie.
  const rawSentences = clean
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Zdania dłuższe niż chunkSize tniemy twardo na okna (z zakładką).
  const sentences: string[] = [];
  for (const s of rawSentences) {
    if (s.length <= chunkSize) {
      sentences.push(s);
    } else {
      for (let i = 0; i < s.length; i += Math.max(1, chunkSize - overlap)) {
        sentences.push(s.slice(i, i + chunkSize));
      }
    }
  }

  // 2) Łączenie zdań w ~chunkSize, 3) z zakładką z poprzedniego fragmentu.
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + 1 + sentence.length > chunkSize) {
      chunks.push(current);
      const tail = current.slice(-overlap);
      current = `${tail} ${sentence}`.trim();
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);

  return chunks;
}
