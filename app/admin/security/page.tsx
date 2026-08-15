"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";
import { DAILY_TOKEN_LIMIT } from "@/lib/usage";
import { useAuth } from "../../components/AuthProvider";
import { Icon } from "../../components/BrandIcons";

// ── Typy rekordów z bazy ─────────────────────────────────────────────────────
type UsageRow = {
  user_id: string;
  email: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  created_at: string;
};
type BlockedRow = {
  id: string;
  user_id: string;
  email: string | null;
  content: string | null;
  reason: string | null;
  created_at: string;
};
type RecentRow = { user_id: string; email: string | null; created_at: string };

type UserAgg = { id: string; email: string | null; today: number; week: number };

function pct(part: number, whole: number) {
  return whole <= 0 ? 0 : Math.round((part / whole) * 100);
}
function who(email: string | null, id: string) {
  return email ?? `${id.slice(0, 8)}…`;
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(d);
}

function Section({
  icon, title, children,
}: {
  icon: "alert" | "report" | "shield" | "agent";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface" style={{ padding: "16px 18px", marginBottom: 16 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Icon name={icon} /> {title}
      </h2>
      {children}
    </section>
  );
}

export default function SecurityPanelPage() {
  const { user, loading: authLoading } = useAuth();
  const admin = isAdmin(user?.email);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [blocked, setBlocked] = useState<BlockedRow[]>([]);
  const [recent, setRecent] = useState<RecentRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const now = Date.now();
      const weekStart = new Date(now - 7 * 24 * 3600 * 1000).toISOString();
      const tenMinAgo = new Date(now - 10 * 60 * 1000).toISOString();

      const [u, b, r] = await Promise.all([
        supabase
          .from("api_usage")
          .select("user_id, email, tokens_input, tokens_output, created_at")
          .gte("created_at", weekStart),
        supabase
          .from("message_logs")
          .select("id, user_id, email, content, reason, created_at")
          .eq("blocked", true)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("message_logs")
          .select("user_id, email, created_at")
          .gte("created_at", tenMinAgo),
      ]);

      if (u.error) throw u.error;
      if (b.error) throw b.error;
      if (r.error) throw r.error;

      setUsage((u.data ?? []) as UsageRow[]);
      setBlocked((b.data ?? []) as BlockedRow[]);
      setRecent((r.data ?? []) as RecentRow[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Nie udało się wczytać danych.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (admin) load();
  }, [admin, load]);

  // ── Agregacje ──────────────────────────────────────────────────────────────
  const dayStart = new Date().toISOString().slice(0, 10) + "T00:00:00.000Z";

  const topUsers = useMemo<UserAgg[]>(() => {
    const map = new Map<string, UserAgg>();
    for (const row of usage) {
      const t = (row.tokens_input ?? 0) + (row.tokens_output ?? 0);
      const cur = map.get(row.user_id) ?? { id: row.user_id, email: row.email, today: 0, week: 0 };
      cur.week += t;
      if (row.created_at >= dayStart) cur.today += t;
      if (row.email) cur.email = row.email;
      map.set(row.user_id, cur);
    }
    return [...map.values()].sort((a, b) => b.week - a.week).slice(0, 5);
  }, [usage, dayStart]);

  const stats = useMemo(() => {
    let today = 0, week = 0;
    const usersToday = new Set<string>();
    for (const row of usage) {
      const t = (row.tokens_input ?? 0) + (row.tokens_output ?? 0);
      week += t;
      if (row.created_at >= dayStart) { today += t; usersToday.add(row.user_id); }
    }
    const avg = usersToday.size ? Math.round(today / usersToday.size) : 0;
    return { today, week, avg, usersToday: usersToday.size };
  }, [usage, dayStart]);

  const alerts = useMemo(() => {
    const out: { level: "high" | "mid"; text: string }[] = [];

    // 1) ≥80% dziennego limitu
    for (const u of topUsers) {
      const p = pct(u.today, DAILY_TOKEN_LIMIT);
      if (p >= 80) {
        out.push({
          level: p >= 100 ? "high" : "mid",
          text: `${who(u.email, u.id)} — ${p}% dziennego limitu (${u.today}/${DAILY_TOKEN_LIMIT} tok.)`,
        });
      }
    }

    // 2) >20 wiadomości w 10 minut
    const cnt = new Map<string, { email: string | null; n: number }>();
    for (const r of recent) {
      const c = cnt.get(r.user_id) ?? { email: r.email, n: 0 };
      c.n += 1;
      if (r.email) c.email = r.email;
      cnt.set(r.user_id, c);
    }
    for (const [id, c] of cnt) {
      if (c.n > 20) out.push({ level: "high", text: `${who(c.email, id)} — ${c.n} wiadomości w 10 min (podejrzany ruch)` });
    }

    // 3) świeże zablokowane wiadomości
    if (blocked.length > 0) {
      out.push({ level: "mid", text: `${blocked.length} zablokowanych wiadomości (ostatnie 50) — patrz sekcja poniżej` });
    }
    return out;
  }, [topUsers, recent, blocked]);

  // ── Stany dostępu ────────────────────────────────────────────────────────────
  if (authLoading) {
    return <Centered>Ładowanie…</Centered>;
  }
  if (!user) {
    return <Centered>🔒 Zaloguj się, aby zobaczyć panel.</Centered>;
  }
  if (!admin) {
    return (
      <Centered>
        <div style={{ fontSize: 40 }}>🛡️</div>
        <div style={{ fontWeight: 700, marginTop: 8 }}>Brak dostępu</div>
        <div className="muted" style={{ marginTop: 4 }}>
          Panel bezpieczeństwa jest dostępny tylko dla administratorów.
        </div>
      </Centered>
    );
  }

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 16px 48px" }}>
      <header
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="shield" size={24} /> Panel bezpieczeństwa
          </h1>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Zalogowany jako administrator: {user.email}
          </p>
        </div>
        <button type="button" className="btn" onClick={load} disabled={loading} style={{ cursor: loading ? "wait" : "pointer" }}>
          {loading ? "⏳ Odświeżam…" : "🔄 Odśwież"}
        </button>
      </header>

      {err && (
        <div style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)", color: "var(--text)", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
          ⚠️ {err}
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Sprawdź, czy w Supabase istnieją tabele <code>message_logs</code> i <code>api_usage</code> (migracje W2–W4).
          </div>
        </div>
      )}

      {/* 4. STATYSTYKI (na górze — szybki przegląd) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Stat label="Tokeny dziś" value={stats.today.toLocaleString("pl-PL")} />
        <Stat label="Tokeny (7 dni)" value={stats.week.toLocaleString("pl-PL")} />
        <Stat label="Zablokowane" value={String(blocked.length)} accent="danger" />
        <Stat label="Śr. tokenów / user (dziś)" value={stats.avg.toLocaleString("pl-PL")} />
      </div>

      {/* 3. ALERTY */}
      <Section icon="alert" title="🔴 Alerty">
        {alerts.length === 0 ? (
          <p className="muted" style={{ fontSize: 14 }}>✅ Brak alertów — spokojnie.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {alerts.map((a, i) => (
              <div
                key={i}
                style={{
                  fontSize: 14, padding: "8px 12px", borderRadius: 8,
                  background: a.level === "high" ? "var(--danger-bg)" : "var(--warn-bg)",
                  border: `1px solid ${a.level === "high" ? "var(--danger-border)" : "var(--warn-border)"}`,
                }}
              >
                {a.level === "high" ? "🔴" : "🟡"} {a.text}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 2. TOP 5 UŻYTKOWNIKÓW */}
      <Section icon="report" title="📊 Top 5 użytkowników po zużyciu">
        {topUsers.length === 0 ? (
          <p className="muted" style={{ fontSize: 14 }}>Brak danych o zużyciu (jeszcze nikt nie rozmawiał).</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
                  <th style={{ padding: "6px 8px" }}>Użytkownik</th>
                  <th style={{ padding: "6px 8px" }}>Dziś</th>
                  <th style={{ padding: "6px 8px" }}>7 dni</th>
                  <th style={{ padding: "6px 8px", minWidth: 140 }}>% dziennego limitu</th>
                </tr>
              </thead>
              <tbody>
                {topUsers.map((u) => {
                  const p = pct(u.today, DAILY_TOKEN_LIMIT);
                  const barColor = p >= 100 ? "var(--danger)" : p >= 80 ? "var(--warn)" : "var(--brand)";
                  return (
                    <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px" }}>{who(u.email, u.id)}</td>
                      <td style={{ padding: "8px" }}>{u.today.toLocaleString("pl-PL")}</td>
                      <td style={{ padding: "8px" }}>{u.week.toLocaleString("pl-PL")}</td>
                      <td style={{ padding: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden", minWidth: 60 }}>
                            <div style={{ width: `${Math.min(100, p)}%`, height: "100%", background: barColor }} />
                          </div>
                          <span style={{ minWidth: 36, textAlign: "right", color: barColor }}>{p}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* 1. ZABLOKOWANE WIADOMOŚCI */}
      <Section icon="shield" title="⚠️ Zablokowane wiadomości">
        {blocked.length === 0 ? (
          <p className="muted" style={{ fontSize: 14 }}>Brak zablokowanych wiadomości. 🎉</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {blocked.map((m) => (
              <div key={m.id} style={{ border: "1px solid var(--border)", borderLeft: "3px solid var(--danger)", borderRadius: 8, padding: "8px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{who(m.email, m.user_id)}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{fmtDate(m.created_at)}</span>
                </div>
                {m.reason && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 2 }}>Powód: {m.reason}</div>}
                {m.content && (
                  <div className="muted" style={{ fontSize: 13, marginTop: 4, fontStyle: "italic", wordBreak: "break-word" }}>
                    „{m.content}”
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "danger" }) {
  return (
    <div className="surface" style={{ padding: "12px 14px" }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: accent === "danger" ? "var(--danger)" : "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 480, margin: "80px auto", textAlign: "center", padding: "0 16px", color: "var(--text)" }}>
      {children}
    </div>
  );
}
