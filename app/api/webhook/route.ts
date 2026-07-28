import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { supabase } from "@/lib/supabase";

// Webhook (L09/W3): przyjmuje zdarzenie z zewnątrz, agent je analizuje i zapisuje.
// POST { type: string, data: any } → { success, analysis, event_id }

// Instrukcja analizy zależna od typu zdarzenia.
function instructionFor(type: string): string {
  switch (type) {
    case "feedback":
      return (
        "To opinia klienta. Przeanalizuj ją i podaj (czysty markdown, zwięźle):\n" +
        "- **Sentyment**: pozytywny / neutralny / negatywny\n" +
        "- **Priorytet reakcji**: 🔴 wysoki / 🟡 średni / 🟢 niski (uzasadnij 1 zdaniem)\n" +
        "- **Proponowana odpowiedź**: krótki, profesjonalny szkic (2-3 zdania)"
      );
    case "alert":
      return (
        "To alert systemowy. Przeanalizuj go i podaj (czysty markdown, zwięźle):\n" +
        "- **Severity**: 🔴 krytyczny / 🟠 wysoki / 🟡 średni / 🟢 niski\n" +
        "- **Prawdopodobna przyczyna**: (1 zdanie)\n" +
        "- **Zalecane działanie**: konkretne kroki (1-3 punkty)"
      );
    case "order":
      return (
        "To nowe zamówienie. Potwierdź je i podaj (czysty markdown, zwięźle):\n" +
        "- **Podsumowanie zamówienia**\n" +
        "- **Sugerowany następny krok** (np. potwierdzenie mailem, wysyłka)"
      );
    default:
      return "Przeanalizuj poniższe dane zdarzenia i napisz zwięzłe, użyteczne podsumowanie po polsku.";
  }
}

const SYSTEM_PROMPT =
  "Jesteś agentem reagującym na zdarzenia przychodzące (webhooki). " +
  "Analizujesz dane i zwracasz krótką, konkretną analizę po polsku. " +
  "Opieraj się wyłącznie na przekazanych danych — nie zmyślaj.";

export async function POST(req: Request) {
  let body: { type?: string; data?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ success: false, error: "Nieprawidłowy JSON." }, { status: 400 });
  }

  const type = (body.type ?? "").trim();
  const data = body.data;
  if (!type || data == null) {
    return Response.json(
      { success: false, error: "Wymagane pola: type oraz data." },
      { status: 400 },
    );
  }

  // Analiza (jedno wywołanie modelu — niezawodne mimo limitu).
  let analysis: string;
  try {
    const { text } = await generateText({
      model: google("gemini-3.1-flash-lite"),
      system: SYSTEM_PROMPT,
      prompt:
        `${instructionFor(type)}\n\n` +
        `Typ zdarzenia: ${type}\n` +
        `Dane (JSON):\n${JSON.stringify(data, null, 2)}`,
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      maxRetries: 1,
    });
    analysis = text;
  } catch (e) {
    console.error("[WEBHOOK] błąd analizy:", e);
    return Response.json(
      { success: false, error: "Nie udało się przeanalizować zdarzenia (limit API?)." },
      { status: 502 },
    );
  }

  // Zapis do Supabase (tabela webhook_events — patrz migracja SQL z W3).
  const { data: inserted, error } = await supabase
    .from("webhook_events")
    .insert({ type, data, analysis })
    .select("id")
    .single();

  if (error) {
    console.error("[WEBHOOK] błąd zapisu:", error.message);
    return Response.json({
      success: true,
      analysis,
      event_id: null,
      saved: false,
      saveError: error.message,
    });
  }

  return Response.json({
    success: true,
    analysis,
    event_id: inserted.id,
    saved: true,
  });
}
