"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Markdown } from "../components/Markdown";
import { timeAgo, formatDateTime } from "@/lib/time";

type Briefing = {
  id: string;
  created_at: string;
  content: string;
  date: string | null;
};

function briefingTitle(content: string): string {
  const firstLine = content.split("\n").find((l) => l.trim());
  return (firstLine ?? "Briefing").replace(/^#+\s*/, "").trim();
}

export default function BriefingsPage() {
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Briefing | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from("briefings")
        .select("id, created_at, content, date")
        .order("created_at", { ascending: false })
        .limit(30);
      if (err) throw err;
      setBriefings((data ?? []) as Briefing[]);
    } catch (e) {
      console.error("Briefingi: błąd wczytywania", e);
      setError("Nie udało się wczytać briefingów.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const generateNow = async () => {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/briefings/generate", { method: "POST" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Nie udało się wygenerować briefingu.");
      if (data.saved === false) setError(`Wygenerowano, ale nie zapisano: ${data.saveError ?? "błąd zapisu"}`);
      await load();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Coś poszło nie tak.");
    } finally {
      setGenerating(false);
    }
  };

  const copySelected = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  if (selected) {
    return (
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 16px 48px" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <button type="button" className="btn" onClick={() => setSelected(null)}>
            ← Wróć do listy
          </button>
          <button type="button" className="btn" onClick={copySelected} style={{ color: copied ? "var(--brand)" : undefined }}>
            {copied ? "✅ Skopiowano!" : "📋 Kopiuj"}
          </button>
        </div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>
          {formatDateTime(selected.created_at)} · wygenerowany automatycznie
        </div>
        <div className="surface" style={{ padding: "18px 22px" }}>
          <Markdown text={selected.content} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 16px 48px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700 }}>📰 Briefingi</h1>
          <p style={{ color: "var(--muted)", marginTop: 6, fontSize: 14 }}>
            Automatyczne podsumowania dnia od Twojego agenta
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={generateNow} disabled={generating} style={{ whiteSpace: "nowrap" }}>
          {generating ? "Generuję…" : "🔄 Wygeneruj teraz"}
        </button>
      </header>

      {error && <div style={{ color: "var(--danger)", fontSize: 14, marginBottom: 16 }}>⚠️ {error}</div>}

      {loading ? (
        <div style={{ color: "var(--muted)", padding: "20px 0" }}>Wczytuję…</div>
      ) : briefings.length === 0 ? (
        <div className="surface" style={{ textAlign: "center", padding: "48px 16px", color: "var(--muted)", borderStyle: "dashed" }}>
          <p style={{ marginBottom: 16 }}>
            Brak briefingów. Cron job wygeneruje pierwszy jutro rano — albo kliknij poniżej.
          </p>
          <button type="button" className="btn-primary" onClick={generateNow} disabled={generating}>
            {generating ? "Generuję…" : "🔄 Wygeneruj teraz"}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {briefings.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelected(b)}
              className="surface"
              style={{ textAlign: "left", padding: "14px 18px", cursor: "pointer", color: "inherit" }}
            >
              <div style={{ fontWeight: 700, fontSize: 15 }}>{briefingTitle(b.content)}</div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                {timeAgo(b.created_at)} · ✅ wygenerowany automatycznie
              </div>
              <div
                style={{
                  color: "var(--muted)",
                  fontSize: 13,
                  marginTop: 8,
                  lineHeight: 1.4,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {b.content.replace(/[#*>`]/g, "").replace(/\n+/g, " ").slice(0, 150)}…
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
