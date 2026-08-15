"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";
import { useAuth } from "../../components/AuthProvider";
import { Icon } from "../../components/BrandIcons";
import { LineChart, BarChart, EndpointBars, fmtInt, type Point } from "../../components/UsageCharts";

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard użycia (Lekcja 11, Warsztat 2) — /admin/dashboard
//
// Liczby: użytkownicy, rozmowy, tokeny dziś, koszt dziś.
// Wykresy (czyste SVG — patrz components/UsageCharts.tsx):
//   • linia — tokeny per dzień (7 dni)
//   • słupki — rozmowy per dzień (7 dni)
//   • słupki poziome — tokeny per endpoint
// Tabela: 10 ostatnich rozmów + widok tabelaryczny danych z wykresów.
// ─────────────────────────────────────────────────────────────────────────────

// Cennik Gemini Flash-Lite (USD za 1 mln tokenów). Zmień, jeśli używasz innego modelu.
const PRICE_PER_1M_INPUT = 0.1;
const PRICE_PER_1M_OUTPUT = 0.4;

type ConversationRow = {
  id: string;
  user_id: string | null;
  title: string | null;
  created_at: string;
};
type UsageRow = {
  user_id: string;
  email: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  endpoint: string | null;
  created_at: string;
};

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const dayLabel = (d: Date) =>
  new Intl.DateTimeFormat("pl-PL", { weekday: "short", day: "numeric" }).format(d);

/** Ostatnie 7 dni (lokalnie), od najstarszego do dziś. */
function last7Days(): Date[] {
  const out: Date[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    d.setHours(0, 0, 0, 0);
    out.push(d);
  }
  return out;
}

const fmtUsd = (n: number) => `$${n < 1 ? n.toFixed(4) : n.toFixed(2)}`;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface" style={{ padding: "16px 18px", marginBottom: 16 }}>
      <h2 style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 14 }}>{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="surface" style={{ padding: "13px 15px" }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: "var(--text)" }}>{value}</div>
      {hint && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 480, margin: "80px auto", textAlign: "center", padding: "0 16px" }}>
      {children}
    </div>
  );
}

export default function UsageDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const admin = isAdmin(user?.email);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [convs, setConvs] = useState<ConversationRow[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [msgCounts, setMsgCounts] = useState<Record<string, number>>({});
  const [showTable, setShowTable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const weekStart = last7Days()[0].toISOString();

      const [c, u] = await Promise.all([
        supabase
          .from("conversations")
          .select("id, user_id, title, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("api_usage")
          .select("user_id, email, tokens_input, tokens_output, endpoint, created_at")
          .gte("created_at", weekStart),
      ]);
      if (c.error) throw c.error;
      if (u.error) throw u.error;

      const conversations = (c.data ?? []) as ConversationRow[];
      setConvs(conversations);
      setUsage((u.data ?? []) as UsageRow[]);

      // Liczba wiadomości dla 10 ostatnich rozmów (do tabeli).
      const recentIds = conversations.slice(0, 10).map((r) => r.id);
      if (recentIds.length > 0) {
        const m = await supabase
          .from("messages")
          .select("conversation_id")
          .in("conversation_id", recentIds);
        if (m.error) throw m.error;
        const counts: Record<string, number> = {};
        for (const row of (m.data ?? []) as { conversation_id: string }[]) {
          counts[row.conversation_id] = (counts[row.conversation_id] ?? 0) + 1;
        }
        setMsgCounts(counts);
      } else {
        setMsgCounts({});
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Nie udało się wczytać danych.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (admin) load();
  }, [admin, load]);

  const days = useMemo(last7Days, []);
  const todayKey = dayKey(new Date());

  // Mapa user_id → email (conversations nie trzyma e-maila; api_usage tak).
  const emailById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of usage) if (r.email) m.set(r.user_id, r.email);
    return m;
  }, [usage]);

  const tokensPerDay = useMemo<Point[]>(() => {
    const sums = new Map<string, number>();
    for (const r of usage) {
      const k = dayKey(new Date(r.created_at));
      sums.set(k, (sums.get(k) ?? 0) + (r.tokens_input ?? 0) + (r.tokens_output ?? 0));
    }
    return days.map((d) => ({ key: dayKey(d), label: dayLabel(d), value: sums.get(dayKey(d)) ?? 0 }));
  }, [usage, days]);

  const convsPerDay = useMemo<Point[]>(() => {
    const sums = new Map<string, number>();
    for (const r of convs) {
      const k = dayKey(new Date(r.created_at));
      sums.set(k, (sums.get(k) ?? 0) + 1);
    }
    return days.map((d) => ({ key: dayKey(d), label: dayLabel(d), value: sums.get(dayKey(d)) ?? 0 }));
  }, [convs, days]);

  const endpointRows = useMemo(() => {
    const sums = new Map<string, number>();
    for (const r of usage) {
      const k = r.endpoint ?? "(nieznany)";
      sums.set(k, (sums.get(k) ?? 0) + (r.tokens_input ?? 0) + (r.tokens_output ?? 0));
    }
    return [...sums.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [usage]);

  const stats = useMemo(() => {
    const users = new Set(convs.map((c) => c.user_id).filter(Boolean)).size;
    let inToday = 0, outToday = 0, tokensWeek = 0;
    for (const r of usage) {
      const ti = r.tokens_input ?? 0;
      const to = r.tokens_output ?? 0;
      tokensWeek += ti + to;
      if (dayKey(new Date(r.created_at)) === todayKey) {
        inToday += ti;
        outToday += to;
      }
    }
    const costToday =
      (inToday / 1_000_000) * PRICE_PER_1M_INPUT + (outToday / 1_000_000) * PRICE_PER_1M_OUTPUT;
    return { users, conversations: convs.length, tokensToday: inToday + outToday, tokensWeek, costToday };
  }, [convs, usage, todayKey]);

  const endpointTotal = endpointRows.reduce((s, r) => s + r.value, 0);
  const hasData = convs.length > 0 || usage.length > 0;

  if (authLoading) return <Centered><span className="muted">Ładowanie…</span></Centered>;
  if (!user) return <Centered>🔒 Zaloguj się, aby zobaczyć dashboard.</Centered>;
  if (!admin) {
    return (
      <Centered>
        <div style={{ fontSize: 40 }}>📊</div>
        <div style={{ fontWeight: 700, marginTop: 8 }}>Brak dostępu</div>
        <div className="muted" style={{ marginTop: 4 }}>
          Dashboard użycia jest dostępny tylko dla administratorów.
        </div>
      </Centered>
    );
  }

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 16px 48px" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="stats" size={24} /> Dashboard użycia
          </h1>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Statystyki agenta — ostatnie 7 dni · {user.email}
          </p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={load}
          disabled={loading}
          style={{ cursor: loading ? "wait" : "pointer" }}
        >
          {loading ? "⏳ Odświeżam…" : "🔄 Odśwież"}
        </button>
      </header>

      {err && (
        <div
          style={{
            background: "var(--danger-bg)",
            border: "1px solid var(--danger-border)",
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 16,
          }}
        >
          ⚠️ {err}
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Sprawdź, czy w Supabase istnieją tabele <code>conversations</code>, <code>messages</code> i{" "}
            <code>api_usage</code>.
          </div>
        </div>
      )}

      {/* Trzymamy poprzedni render przy odświeżaniu (bez migotania szkieletu) */}
      <div style={{ opacity: loading && hasData ? 0.6 : 1, transition: "opacity 0.2s" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <Stat label="👥 Użytkownicy" value={fmtInt(stats.users)} hint="unikalni (rozmowy)" />
          <Stat label="💬 Rozmowy" value={fmtInt(stats.conversations)} hint="łącznie" />
          <Stat
            label="🔤 Tokeny dziś"
            value={fmtInt(stats.tokensToday)}
            hint={`7 dni: ${fmtInt(stats.tokensWeek)}`}
          />
          <Stat label="💰 Koszt dziś" value={fmtUsd(stats.costToday)} hint="Flash-Lite: $0.10/$0.40 za 1M" />
        </div>

        <Card title="🔤 Tokeny per dzień (7 dni)">
          <LineChart data={tokensPerDay} unit="tokenów" />
        </Card>

        <Card title="💬 Rozmowy per dzień (7 dni)">
          <BarChart data={convsPerDay} unit="rozmów" />
        </Card>

        {/* Widok tabelaryczny — dostępny odpowiednik obu wykresów czasowych */}
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            className="btn"
            onClick={() => setShowTable((v) => !v)}
            style={{ padding: "6px 14px", fontSize: 13, cursor: "pointer" }}
          >
            {showTable ? "▲ Ukryj dane w tabeli" : "▼ Pokaż dane w tabeli"}
          </button>
          {showTable && (
            <div className="surface" style={{ padding: "12px 16px", marginTop: 10, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
                    <th style={{ padding: "6px 8px" }}>Dzień</th>
                    <th style={{ padding: "6px 8px" }}>Tokeny</th>
                    <th style={{ padding: "6px 8px" }}>Rozmowy</th>
                  </tr>
                </thead>
                <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
                  {tokensPerDay.map((d, i) => (
                    <tr key={d.key} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "7px 8px" }}>{d.label}</td>
                      <td style={{ padding: "7px 8px" }}>{fmtInt(d.value)}</td>
                      <td style={{ padding: "7px 8px" }}>{fmtInt(convsPerDay[i].value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Card title="🔀 Tokeny per endpoint (7 dni)">
          <EndpointBars rows={endpointRows} total={endpointTotal} />
        </Card>

        <Card title="🕐 Ostatnie rozmowy">
          {convs.length === 0 ? (
            <p className="muted" style={{ fontSize: 14, margin: 0 }}>Brak rozmów.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
                    <th style={{ padding: "6px 8px" }}>Użytkownik</th>
                    <th style={{ padding: "6px 8px" }}>Tytuł</th>
                    <th style={{ padding: "6px 8px" }}>Data</th>
                    <th style={{ padding: "6px 8px" }}>Wiad.</th>
                  </tr>
                </thead>
                <tbody>
                  {convs.slice(0, 10).map((c) => (
                    <tr key={c.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "7px 8px" }}>
                        {c.user_id ? emailById.get(c.user_id) ?? `${c.user_id.slice(0, 8)}…` : "—"}
                      </td>
                      <td
                        style={{
                          padding: "7px 8px",
                          maxWidth: 280,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={c.title ?? ""}
                      >
                        {c.title ?? "(bez tytułu)"}
                      </td>
                      <td style={{ padding: "7px 8px", fontVariantNumeric: "tabular-nums" }}>
                        {new Intl.DateTimeFormat("pl-PL", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(c.created_at))}
                      </td>
                      <td style={{ padding: "7px 8px", fontVariantNumeric: "tabular-nums" }}>
                        {msgCounts[c.id] ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
