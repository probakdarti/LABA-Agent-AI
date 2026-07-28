"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Markdown } from "../components/Markdown";
import { timeAgo, formatDateTime } from "@/lib/time";

type WebhookEvent = {
  id: string;
  created_at: string;
  type: string | null;
  data: unknown;
  analysis: string | null;
};

// Kolory z tokenów motywu — stałe hexy miały za mały kontrast na jasnym tle.
const TYPE_META: Record<string, { emoji: string; color: string }> = {
  feedback: { emoji: "💬", color: "var(--ok)" },
  alert: { emoji: "🚨", color: "var(--danger)" },
  order: { emoji: "🛒", color: "var(--info)" },
};

export default function WebhookEventsPage() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<WebhookEvent | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from("webhook_events")
        .select("id, created_at, type, data, analysis")
        .order("created_at", { ascending: false })
        .limit(50);
      if (err) throw err;
      setEvents((data ?? []) as WebhookEvent[]);
    } catch (e) {
      console.error("Zdarzenia: błąd wczytywania", e);
      setError("Nie udało się wczytać zdarzeń. Czy tabela webhook_events istnieje?");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const meta = (t: string | null) => TYPE_META[t ?? ""] ?? { emoji: "📩", color: "var(--muted)" };

  // ── Szczegóły ───────────────────────────────────────────────────────────────
  if (selected) {
    const m = meta(selected.type);
    return (
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 16px 48px" }}>
        <button type="button" className="btn" onClick={() => setSelected(null)} style={{ marginBottom: 18 }}>
          ← Wróć do listy
        </button>
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>
          <span style={{ color: m.color, fontWeight: 700 }}>
            {m.emoji} {selected.type}
          </span>{" "}
          · {formatDateTime(selected.created_at)}
        </div>

        <div className="surface" style={{ padding: "14px 18px", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>📥 Dane zdarzenia</div>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: 13,
              color: "var(--muted)",
              fontFamily: "ui-monospace, monospace",
            }}
          >
            {JSON.stringify(selected.data, null, 2)}
          </pre>
        </div>

        <div className="surface" style={{ padding: "14px 18px" }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>🤖 Analiza agenta</div>
          <Markdown text={selected.analysis ?? "(brak analizy)"} />
        </div>
      </div>
    );
  }

  // ── Lista ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 16px 48px" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700 }}>🔔 Zdarzenia webhooków</h1>
          <p style={{ color: "var(--muted)", marginTop: 6, fontSize: 14 }}>
            Zdarzenia przychodzące (feedback, alerty, zamówienia) i analiza agenta
          </p>
        </div>
        <button type="button" className="btn" onClick={load} disabled={loading}>
          🔄 Odśwież
        </button>
      </header>

      {error && <div style={{ color: "var(--danger)", fontSize: 14, marginBottom: 16 }}>⚠️ {error}</div>}

      {loading ? (
        <div style={{ color: "var(--muted)", padding: "20px 0" }}>Wczytuję…</div>
      ) : events.length === 0 ? (
        <div
          className="surface"
          style={{ textAlign: "center", padding: "48px 16px", color: "var(--muted)", borderStyle: "dashed" }}
        >
          Brak zdarzeń. Wyślij webhooka na <code>/api/webhook</code>, a pojawi się tutaj.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {events.map((ev) => {
            const m = meta(ev.type);
            return (
              <button
                key={ev.id}
                type="button"
                onClick={() => setSelected(ev)}
                className="surface"
                style={{
                  textAlign: "left",
                  padding: "14px 18px",
                  cursor: "pointer",
                  color: "inherit",
                  borderLeft: `4px solid ${m.color}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, color: m.color }}>
                    {m.emoji} {ev.type ?? "zdarzenie"}
                  </span>
                  <span style={{ color: "var(--muted)", fontSize: 13 }}>{timeAgo(ev.created_at)}</span>
                </div>
                <div
                  style={{
                    color: "var(--muted)",
                    fontSize: 13,
                    marginTop: 8,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {(ev.analysis ?? "").replace(/[#*>`]/g, "").replace(/\n+/g, " ").slice(0, 140) || "(brak analizy)"}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
