"use client";

import { useState } from "react";
import { Markdown } from "../components/Markdown";

const EXAMPLES: { label: string; notes: string }[] = [
  {
    label: "Spotkanie projektowe",
    notes: `spotkanie 23.07 projekt CRM, obecni: Anna, Marek, Kuba
ustalili że MVP na 15 września
Anna robi makiety do piątku
Marek ogarnia backend API, deadline koniec sierpnia
budżet 50k, Kuba pyta czy starczy - do sprawdzenia
klient chce integrację z mailingiem - dodać do zakresu
następne spotkanie za 2 tygodnie`,
  },
  {
    label: "Standup zespołu",
    notes: `daily 23.07
Ola skończyła logowanie, dziś bierze się za panel użytkownika
Piotr blokada - czeka na dostęp do bazy od DevOps, trzeba pingnąć Tomka
Kasia testuje płatności, znalazła bug z groszami przy zaokrąglaniu, poprawi jutro
release planowany na piątek jeśli testy przejdą`,
  },
];

export default function MeetingSummaryPage() {
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const summarize = async () => {
    if (!notes.trim() || loading) return;
    setLoading(true);
    setResult("");
    setError(null);
    try {
      const res = await fetch("/api/meeting-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok || !res.body) throw new Error(`Serwer zwrócił błąd (${res.status}).`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setResult((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Coś poszło nie tak.");
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 16px 48px" }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700 }}>📋 Podsumowanie spotkań</h1>
        <p className="muted" style={{ marginTop: 6, fontSize: 14 }}>
          Wklej surowe notatki — agent zrobi profesjonalną minutkę z action items
        </p>
      </header>

      <textarea
        className="input"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Wklej notatki ze spotkania..."
        disabled={loading}
        style={{
          minHeight: 200,
          padding: "12px 14px",
          lineHeight: 1.5,
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          onClick={summarize}
          className="btn-primary"
          disabled={loading || !notes.trim()}
          style={{
            fontSize: 15,
            cursor: loading || !notes.trim() ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Podsumowuję…" : "📋 Podsumuj spotkanie"}
        </button>
        <span className="muted" style={{ fontSize: 13 }}>
          Przykłady:
        </span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            className="btn"
            onClick={() => setNotes(ex.notes)}
            disabled={loading}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              fontSize: 13,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {ex.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ color: "var(--danger)", fontSize: 14, marginTop: 16 }}>⚠️ {error}</div>
      )}

      {loading && result === "" && (
        <div className="muted" style={{ marginTop: 20 }}>
          Czytam notatki i piszę podsumowanie…
        </div>
      )}

      {result && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button
              type="button"
              onClick={copy}
              className="btn"
              style={{
                padding: "6px 14px",
                color: copied ? "var(--ok)" : "var(--text)",
                fontSize: 13,
              }}
            >
              {copied ? "✅ Skopiowano!" : "📋 Kopiuj podsumowanie"}
            </button>
          </div>
          <div className="surface" style={{ padding: "18px 22px", overflowX: "auto" }}>
            <Markdown text={result} />
          </div>
        </div>
      )}
    </div>
  );
}
