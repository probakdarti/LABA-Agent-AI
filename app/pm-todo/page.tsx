"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "../components/AuthProvider";
import { ChatShell } from "../components/ChatShell";
import { Icon } from "../components/BrandIcons";
import { ProgressSlider, ProgressSliderStyles, progressColor } from "../components/ProgressSlider";

// ─────────────────────────────────────────────────────────────────────────────
// PM TO DO — zadania użytkownika z terminem i suwakiem postępu (0–100%).
//
// • Dane w Supabase (tabela `tasks`) — każdy użytkownik widzi tylko swoje zadania.
// • Suwak ma skalę kolorystyczną: czerwony (0%) → żółty (50%) → zielony (100%).
// • Pod listą czat, który odpowiada na pytania o zadania (endpoint /api/pm-todo).
// ─────────────────────────────────────────────────────────────────────────────

type Task = {
  id: string;
  title: string;
  due_date: string | null;
  progress: number;
  completed_at: string | null;
  created_at: string;
};

/** Dzisiejsza data (lokalnie) jako YYYY-MM-DD. */
function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA").format(new Date());
}

function formatDue(due: string | null): string {
  if (!due) return "bez terminu";
  const d = new Date(`${due}T00:00:00`);
  return new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

function daysLeft(due: string | null): number | null {
  if (!due) return null;
  const a = Date.parse(`${todayISO()}T00:00:00Z`);
  const b = Date.parse(`${due}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

const QUESTIONS = [
  "Jakie zadania mam do wykonania na dzisiaj?",
  "Jakie zadania mam w tym tygodniu?",
  "Jakie zadania wykonałem przez ostatnie 7 dni?",
  "Które zadania mają największy % realizacji?",
  "Które zadania mają najmniejszy % realizacji?",
];

export default function PmTodoPage() {
  const { user, loading: authLoading } = useAuth();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [adding, setAdding] = useState(false);

  // Zapis postępu z opóźnieniem — przesuwanie suwaka nie zasypuje bazy zapytaniami.
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setErr(null);
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, due_date, progress, completed_at, created_at")
        .eq("user_id", user.id)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      setTasks((data ?? []) as Task[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Nie udało się wczytać zadań.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Sprzątanie timerów przy odmontowaniu — inaczej zapis mógłby polecieć po wyjściu.
  useEffect(() => {
    const timers = saveTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t || !user || adding) return;
    setAdding(true);
    setErr(null);
    try {
      const { data, error } = await supabase
        .from("tasks")
        .insert({ user_id: user.id, title: t, due_date: due || null, progress: 0 })
        .select("id, title, due_date, progress, completed_at, created_at")
        .single();
      if (error) throw error;
      setTasks((prev) => [...prev, data as Task]);
      setTitle("");
      setDue("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Nie udało się dodać zadania.");
    } finally {
      setAdding(false);
    }
  };

  const setProgress = (id: string, value: number) => {
    // 1) natychmiast w interfejsie
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              progress: value,
              completed_at: value >= 100 ? t.completed_at ?? new Date().toISOString() : null,
            }
          : t,
      ),
    );

    // 2) zapis do bazy po 500 ms bezruchu
    const timers = saveTimers.current;
    const existing = timers.get(id);
    if (existing) clearTimeout(existing);
    timers.set(
      id,
      setTimeout(async () => {
        timers.delete(id);
        try {
          const { error } = await supabase
            .from("tasks")
            .update({
              progress: value,
              completed_at: value >= 100 ? new Date().toISOString() : null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", id)
            .eq("user_id", user!.id);
          if (error) throw error;
        } catch (e) {
          setErr(e instanceof Error ? e.message : "Nie udało się zapisać postępu.");
        }
      }, 500),
    );
  };

  const removeTask = async (id: string, taskTitle: string) => {
    if (!user) return;
    if (!window.confirm(`Usunąć zadanie „${taskTitle}"?`)) return;
    const backup = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    const { error } = await supabase.from("tasks").delete().eq("id", id).eq("user_id", user.id);
    if (error) {
      setErr(`Nie udało się usunąć: ${error.message}`);
      setTasks(backup); // przywracamy, skoro baza odrzuciła
    }
  };

  // Niezakończone najpierw (wg terminu), ukończone na końcu.
  const sorted = useMemo(() => {
    const open = tasks.filter((t) => t.progress < 100);
    const done = tasks.filter((t) => t.progress >= 100);
    const byDue = (a: Task, b: Task) => {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    };
    return [...open.sort(byDue), ...done.sort(byDue)];
  }, [tasks]);

  const stats = useMemo(() => {
    const today = todayISO();
    const open = tasks.filter((t) => t.progress < 100);
    const overdue = open.filter((t) => t.due_date && t.due_date < today).length;
    const avg = tasks.length
      ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length)
      : 0;
    return { total: tasks.length, open: open.length, overdue, avg };
  }, [tasks]);

  if (authLoading) {
    return <div style={{ padding: 40, textAlign: "center" }} className="muted">Ładowanie…</div>;
  }
  if (!user) {
    return <div style={{ padding: 40, textAlign: "center" }}>🔒 Zaloguj się, aby zobaczyć swoje zadania.</div>;
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px 48px" }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, display: "flex", alignItems: "center", gap: 9 }}>
          <Icon name="checklist" size={23} /> PM TO DO
        </h1>
        <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
          Twoje zadania z terminem i postępem. Pod listą zapytaj agenta o cokolwiek z tej listy.
        </p>
      </header>

      {/* Dodawanie zadania */}
      <form onSubmit={addTask} className="surface" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nowe zadanie, np. Przygotować harmonogram sprintu"
            style={{ flex: 1, minWidth: 220, width: "auto", padding: "9px 12px", fontSize: 14 }}
            aria-label="Treść zadania"
          />
          <input
            className="input"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            required
            style={{ width: "auto", minWidth: 150, padding: "9px 12px", fontSize: 14 }}
            aria-label="Termin wykonania"
            title="Do kiedy zadanie ma być wykonane"
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={adding || !title.trim()}
            style={{ cursor: adding || !title.trim() ? "not-allowed" : "pointer" }}
          >
            {adding ? "Dodaję…" : "➕ Dodaj"}
          </button>
        </div>
      </form>

      {err && (
        <div
          style={{
            background: "var(--danger-bg)",
            border: "1px solid var(--danger-border)",
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 14,
            fontSize: 13.5,
          }}
        >
          ⚠️ {err}
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Jeśli to pierwszy raz — sprawdź, czy w Supabase istnieje tabela <code>tasks</code>{" "}
            (migracja <code>tasks_table.sql</code>).
          </div>
        </div>
      )}

      {/* Podsumowanie */}
      {tasks.length > 0 && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12, fontSize: 13 }}>
          <span className="muted">Wszystkich: <strong style={{ color: "var(--text)" }}>{stats.total}</strong></span>
          <span className="muted">W toku: <strong style={{ color: "var(--text)" }}>{stats.open}</strong></span>
          <span className="muted">
            Po terminie:{" "}
            <strong style={{ color: stats.overdue > 0 ? "var(--danger)" : "var(--text)" }}>
              {stats.overdue}
            </strong>
          </span>
          <span className="muted">Średni postęp: <strong style={{ color: "var(--text)" }}>{stats.avg}%</strong></span>
        </div>
      )}

      {/* Lista zadań */}
      {loading ? (
        <p className="muted" style={{ fontSize: 14 }}>Wczytuję zadania…</p>
      ) : sorted.length === 0 ? (
        <div className="surface" style={{ padding: 22, textAlign: "center" }}>
          <div style={{ fontSize: 30, marginBottom: 6 }}>📋</div>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            Brak zadań. Dodaj pierwsze powyżej — potem zapytaj o nie agenta.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((t) => {
            const color = progressColor(t.progress);
            const left = daysLeft(t.due_date);
            const done = t.progress >= 100;
            const overdue = !done && left != null && left < 0;

            return (
              <div
                key={t.id}
                className="surface"
                style={{
                  padding: "12px 14px",
                  borderLeft: `3px solid ${color}`,
                  opacity: done ? 0.75 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 180,
                      fontSize: 14.5,
                      fontWeight: 600,
                      textDecoration: done ? "line-through" : "none",
                    }}
                  >
                    {done && "✅ "}
                    {t.title}
                  </span>

                  <span
                    style={{
                      fontSize: 12.5,
                      padding: "3px 10px",
                      borderRadius: 999,
                      whiteSpace: "nowrap",
                      border: `1px solid ${overdue ? "var(--danger-border)" : "var(--border)"}`,
                      background: overdue ? "var(--danger-bg)" : "var(--bg)",
                      color: overdue ? "var(--danger)" : "var(--muted)",
                    }}
                    title={t.due_date ?? "bez terminu"}
                  >
                    📅 {formatDue(t.due_date)}
                    {!done && left != null && (
                      <> · {left === 0 ? "dziś" : left > 0 ? `za ${left} dni` : `${Math.abs(left)} dni po terminie`}</>
                    )}
                  </span>

                  <button
                    type="button"
                    onClick={() => removeTask(t.id, t.title)}
                    className="btn"
                    aria-label={`Usuń zadanie ${t.title}`}
                    title="Usuń zadanie"
                    style={{ padding: "4px 10px", fontSize: 13, color: "var(--danger)", cursor: "pointer" }}
                  >
                    🗑
                  </button>
                </div>

                {/* Suwak postępu — kolor od czerwonego przez żółty do zielonego */}
                <div style={{ marginTop: 10 }}>
                  <ProgressSlider
                    value={t.progress}
                    onChange={(v) => setProgress(t.id, v)}
                    label={t.title}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Czat o zadaniach */}
      <section style={{ marginTop: 26 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
          💬 Zapytaj o swoje zadania
        </h2>
        <div
          className="surface"
          style={{ height: 560, overflow: "hidden", padding: 0 }}
        >
          <ChatShell
            apiEndpoint="/api/pm-todo"
            headerTitle="🗓️ Asystent zadań"
            headerSubtitle="Pyta o terminy, postępy i to, co przed Tobą"
            inputPlaceholder="Np. Co mam do zrobienia w tym tygodniu?"
            examples={QUESTIONS}
          />
        </div>
      </section>

      {/* Styl suwaka — wstawiony raz, lokalnie dla tej strony */}
      <ProgressSliderStyles />
    </div>
  );
}
