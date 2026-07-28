import { generateAndSaveBriefing } from "@/lib/briefing";

// Ręczne wygenerowanie briefingu z przycisku "Wygeneruj teraz" na stronie /briefings.
// (Cron ma osobny, zabezpieczony endpoint /api/cron/morning.)
export async function POST() {
  try {
    const { date, content, saved, saveError } = await generateAndSaveBriefing();
    return Response.json({
      success: true,
      date,
      saved,
      ...(saveError ? { saveError } : {}),
      preview: content.slice(0, 200),
    });
  } catch (e) {
    console.error("[briefings/generate] błąd:", e);
    return Response.json(
      { success: false, error: "Nie udało się wygenerować briefingu (limit API?)." },
      { status: 502 },
    );
  }
}
