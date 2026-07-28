import { generateAndSaveBriefing } from "@/lib/briefing";

// Poranny briefing (L09/W1) odpalany przez Vercel Cron (L09/W2).
// Zabezpieczenie: gdy ustawiony CRON_SECRET, wymagamy nagłówka
// Authorization: Bearer <CRON_SECRET> (Vercel Cron dodaje go automatycznie).
// Gdy CRON_SECRET nie jest ustawiony — endpoint pozostaje otwarty.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

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
    console.error("[CRON/morning] błąd:", e);
    return Response.json(
      { success: false, error: "Nie udało się wygenerować briefingu (limit API?)." },
      { status: 502 },
    );
  }
}
