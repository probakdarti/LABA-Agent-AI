import { respondWithModelRouting } from "../model-router";
import { supabase } from "@/lib/supabase";
import { type UIMessage } from "ai";

// ─────────────────────────────────────────────────────────────────────────────
// Czat o zadaniach (PM TO DO).
//
// Zadania użytkownika wczytujemy z Supabase i wstrzykujemy do promptu jako
// kontekst — dzięki temu odpowiedź jest w JEDNYM wywołaniu modelu (bez pętli
// narzędzi), czyli szybciej i taniej. Daty względem „dziś" liczymy po stronie
// serwera, żeby model nie musiał liczyć dni i się nie mylił.
// ─────────────────────────────────────────────────────────────────────────────

const TZ = "Europe/Warsaw";

/** Dzisiejsza data w strefie warszawskiej jako YYYY-MM-DD. */
function todayWarsawISO(): string {
  // en-CA daje format YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.parse(`${fromISO}T00:00:00Z`);
  const b = Date.parse(`${toISO}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

type TaskRow = {
  id: string;
  title: string;
  due_date: string | null;
  progress: number;
  completed_at: string | null;
  created_at: string;
};

/** Opis terminu zrozumiały dla modelu (bez liczenia dat przez model). */
function dueLabel(due: string | null, today: string): string {
  if (!due) return "brak terminu";
  const diff = daysBetween(today, due);
  if (diff === 0) return `${due} (DZIŚ)`;
  if (diff === 1) return `${due} (jutro)`;
  if (diff === -1) return `${due} (PO TERMINIE o 1 dzień)`;
  if (diff < 0) return `${due} (PO TERMINIE o ${Math.abs(diff)} dni)`;
  return `${due} (za ${diff} dni)`;
}

function buildSystemPrompt(tasks: TaskRow[], today: string): string {
  const weekday = new Intl.DateTimeFormat("pl-PL", { weekday: "long", timeZone: TZ }).format(
    new Date(),
  );

  const lines = tasks.map((t) => {
    const done = t.completed_at
      ? `ukończone ${t.completed_at.slice(0, 10)}`
      : t.progress >= 100
        ? "ukończone"
        : "w toku";
    return `- „${t.title}" | termin: ${dueLabel(t.due_date, today)} | postęp: ${t.progress}% | status: ${done} | dodane: ${t.created_at.slice(0, 10)}`;
  });

  const list = lines.length > 0 ? lines.join("\n") : "(brak zadań — lista jest pusta)";

  return `Jesteś asystentem zarządzania zadaniami w aplikacji VERMI (moduł PM TO DO).
Odpowiadasz WYŁĄCZNIE na podstawie listy zadań zalogowanego użytkownika podanej poniżej.

## DZISIAJ
${today} (${weekday}), strefa czasowa Europe/Warsaw.
„Ten tydzień" liczy się od poniedziałku do niedzieli tego samego tygodnia kalendarzowego.

## ZADANIA UŻYTKOWNIKA
${list}

## ZASADY
- Opieraj się TYLKO na powyższej liście. Nie wymyślaj zadań, terminów ani procentów.
- Terminy są już policzone względem dziś (DZIŚ / jutro / za N dni / PO TERMINIE) — korzystaj z nich, nie licz sam.
- Gdy nic nie pasuje do pytania, powiedz wprost: „Nie masz takich zadań" i zaproponuj, co możesz sprawdzić.
- Zadania po terminie i niezakończone oznaczaj 🔴 i wymieniaj jako pierwsze.
- Przy każdym zadaniu podawaj postęp w procentach i termin.
- Gdy zadań jest więcej niż 3, użyj tabeli markdown: Zadanie | Termin | Postęp.
  Przy krótszych odpowiedziach wystarczy lista punktowana.
- Na końcu dodaj jedno zdanie praktycznej rekomendacji (co zrobić najpierw i dlaczego).
- Język: polski, format: czysty markdown, zwięźle.`;
}

export async function POST(req: Request) {
  const {
    messages,
    userId,
    userEmail,
  }: { messages: UIMessage[]; userId?: string; userEmail?: string } = await req.json();

  if (!userId) {
    return Response.json({ error: "Brak identyfikatora użytkownika." }, { status: 401 });
  }

  const today = todayWarsawISO();

  // Tylko zadania zalogowanego użytkownika (izolacja danych na poziomie aplikacji).
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, due_date, progress, completed_at, created_at")
    .eq("user_id", userId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(200);

  if (error) console.warn("[PM-TODO] błąd odczytu zadań:", error.message);

  const tasks = (data ?? []) as TaskRow[];

  return respondWithModelRouting({
    req,
    system: buildSystemPrompt(tasks, today),
    messages,
    logPrefix: "PM-TODO",
    usageContext: { userId, email: userEmail ?? null, endpoint: "/api/pm-todo" },
  });
}
