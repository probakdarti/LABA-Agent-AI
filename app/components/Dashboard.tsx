"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type DashboardData = {
  datetime: { date: string; time: string };
  weather: { city: string; temperature: number; description: string; wind: number; humidity: number } | null;
  rates: { date: string; EUR: number | null; USD: number | null; GBP: number | null } | null;
  holidays: { upcoming: { date: string; name: string }[]; daysToNext: number | null } | null;
  updatedAt: string;
};

const QUICK_ACTIONS = [
  { label: "🌍 Zaplanuj podróż", href: "/travel" },
  { label: "📊 Porównaj waluty", href: "/react?q=" + encodeURIComponent("Porównaj kursy EUR, USD, GBP i CHF do PLN") },
  { label: "🔄 Agent ReAct", href: "/react" },
  { label: "💬 Chat z agentem", href: "/chat" },
  { label: "🧠 Tryb myślenia", href: "/think" },
  { label: "📖 Słownik AI", href: "/fewshot" },
];

// Karta z efektem glassmorphism + gradientem
function Card({
  title,
  gradient,
  children,
  delay,
}: {
  title: string;
  gradient: string;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <div
      style={{
        position: "relative",
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.08)",
        background: gradient,
        padding: 18,
        overflow: "hidden",
        animation: `dashFadeIn 0.5s ease ${delay}s both`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backdropFilter: "blur(4px)",
          background: "rgba(10,10,16,0.35)",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5, marginBottom: 12, color: "#e8e8f0" }}>
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}

function SkeletonLine({ w = "100%" }: { w?: string }) {
  return (
    <div
      style={{
        height: 14,
        width: w,
        borderRadius: 6,
        background: "rgba(255,255,255,0.12)",
        margin: "6px 0",
        animation: "dashPulse 1.4s ease-in-out infinite",
      }}
    />
  );
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      setData(await res.json());
    } catch {
      // zostaw poprzednie dane / pusty stan
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // auto-odświeżanie co 15 minut
    const id = setInterval(load, 15 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const w = data?.weather;
  const r = data?.rates;
  const h = data?.holidays;
  const showSkeleton = loading && !data;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px 48px" }}>
      {/* Nagłówek powitalny */}
      <div
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
          <div style={{ fontSize: 22, fontWeight: 700 }}>🌅 Dzień dobry!</div>
          <div style={{ fontSize: 14, color: "#9a9ac0", marginTop: 2 }}>
            {data ? `Dziś: ${data.datetime.date}, ${data.datetime.time}` : "Ładowanie danych..."}
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          style={{
            padding: "8px 16px",
            borderRadius: 10,
            border: "1px solid #333",
            background: "#1a1a2a",
            color: "#ededed",
            fontSize: 14,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "⏳ Odświeżam..." : "🔄 Odśwież"}
        </button>
      </div>

      {/* Siatka kart (responsywna) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {/* POGODA */}
        <Card title="🌤️ POGODA" gradient="linear-gradient(135deg, #0e3a5f, #0a5a6e)" delay={0}>
          {showSkeleton ? (
            <>
              <SkeletonLine w="60%" />
              <SkeletonLine w="40%" />
              <SkeletonLine w="70%" />
            </>
          ) : w ? (
            <>
              <div style={{ fontSize: 15, color: "#cfe4f0" }}>{w.city}</div>
              <div style={{ fontSize: 34, fontWeight: 700, margin: "4px 0" }}>
                {Math.round(w.temperature)}°C
              </div>
              <div style={{ fontSize: 14, color: "#cfe4f0", textTransform: "capitalize" }}>
                {w.description}
              </div>
              <div style={{ fontSize: 13, color: "#a9c8d8", marginTop: 8 }}>
                Wiatr: {w.wind} km/h · Wilgotność: {w.humidity}%
              </div>
            </>
          ) : (
            <div style={{ color: "#e8b4b4", fontSize: 14 }}>⚠️ Brak danych pogodowych</div>
          )}
        </Card>

        {/* KURSY WALUT */}
        <Card title="💶 KURSY WALUT" gradient="linear-gradient(135deg, #0e4a2f, #0a5e46)" delay={0.08}>
          {showSkeleton ? (
            <>
              <SkeletonLine w="70%" />
              <SkeletonLine w="70%" />
              <SkeletonLine w="50%" />
            </>
          ) : r ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(["EUR", "USD", "GBP"] as const).map((code) =>
                  r[code] != null ? (
                    <div key={code} style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
                      <span style={{ color: "#bfe8cf" }}>1 {code}</span>
                      <strong>{r[code]!.toFixed(4)} PLN</strong>
                    </div>
                  ) : null,
                )}
              </div>
              <div style={{ fontSize: 12, color: "#9cc9ac", marginTop: 10 }}>
                Kurs z: {r.date} (frankfurter.dev)
              </div>
            </>
          ) : (
            <div style={{ color: "#e8b4b4", fontSize: 14 }}>⚠️ Brak danych o kursach</div>
          )}
        </Card>

        {/* ŚWIĘTA */}
        <Card title="📅 NADCHODZĄCE ŚWIĘTA" gradient="linear-gradient(135deg, #5f3a0e, #6e4a0a)" delay={0.16}>
          {showSkeleton ? (
            <>
              <SkeletonLine w="80%" />
              <SkeletonLine w="65%" />
              <SkeletonLine w="50%" />
            </>
          ) : h && h.upcoming.length > 0 ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {h.upcoming.map((holiday) => {
                  const d = new Date(holiday.date);
                  const label = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short" }).format(d);
                  return (
                    <div key={holiday.date} style={{ fontSize: 14 }}>
                      <strong>{label}</strong> — {holiday.name}
                    </div>
                  );
                })}
              </div>
              {h.daysToNext != null && (
                <div style={{ fontSize: 13, color: "#e8c99c", marginTop: 10 }}>
                  Następne za: {h.daysToNext} dni
                </div>
              )}
            </>
          ) : (
            <div style={{ color: "#e8b4b4", fontSize: 14 }}>⚠️ Brak danych o świętach</div>
          )}
        </Card>

        {/* SZYBKIE AKCJE */}
        <Card title="🤖 SZYBKIE AKCJE" gradient="linear-gradient(135deg, #4a1f5f, #6e0a5a)" delay={0.24}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {QUICK_ACTIONS.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                style={{
                  display: "block",
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#f0e8f5",
                  fontSize: 14,
                  textDecoration: "none",
                }}
              >
                {a.label}
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {data && (
        <div style={{ textAlign: "center", fontSize: 12, color: "#666", marginTop: 20 }}>
          Ostatnia aktualizacja: {data.updatedAt} · dane odświeżają się automatycznie co 15 min
        </div>
      )}

      <style>{`
        @keyframes dashFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes dashPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
