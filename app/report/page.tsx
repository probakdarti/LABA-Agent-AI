"use client";

import { useState } from "react";
import { Markdown } from "../components/Markdown";

const EXAMPLES = [
  "Rynek AI w Polsce — trendy, firmy, prognozy na 2026",
  "Porównanie platform e-commerce: Shopify vs WooCommerce vs PrestaShop",
  "Wpływ pracy zdalnej na produktywność — badania i statystyki",
  "Rynek nieruchomości w Krakowie — ceny, trendy, prognozy",
];

export default function ReportPage() {
  const [topic, setTopic] = useState("");
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async (t?: string) => {
    const subject = (t ?? topic).trim();
    if (!subject || loading) return;
    if (t) setTopic(t);
    setLoading(true);
    setReport("");
    setError(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: subject }),
      });
      if (!res.ok || !res.body) throw new Error(`Serwer zwrócił błąd (${res.status}).`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setReport((prev) => prev + decoder.decode(value, { stream: true }));
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
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 16px 48px" }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700 }}>📊 Generator raportów</h1>
        <p className="muted" style={{ marginTop: 6, fontSize: 14 }}>
          Opisz temat — agent napisze raport biznesowy
        </p>
      </header>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          className="input"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void generate();
          }}
          placeholder="Np. Rynek AI w Polsce w 2026 roku..."
          disabled={loading}
          style={{ flex: 1, minWidth: 240, padding: "11px 14px", fontSize: 15 }}
        />
        <button
          type="button"
          className="btn-primary"
          onClick={() => generate()}
          disabled={loading || !topic.trim()}
          style={{
            padding: "11px 20px",
            fontSize: 15,
            cursor: loading || !topic.trim() ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {loading ? "Generuję…" : "📊 Generuj raport"}
        </button>
      </div>

      {/* Klikalne przykłady */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            className="btn"
            onClick={() => generate(ex)}
            disabled={loading}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              fontSize: 13,
              textAlign: "left",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {ex}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ color: "var(--danger)", fontSize: 14, marginTop: 16 }}>⚠️ {error}</div>
      )}

      {loading && report === "" && (
        <div className="muted" style={{ marginTop: 20 }}>
          Agent zbiera dane i pisze raport… (to może potrwać kilkanaście sekund)
        </div>
      )}

      {report && (
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
              {copied ? "✅ Skopiowano!" : "📋 Kopiuj do schowka"}
            </button>
          </div>
          <div className="surface" style={{ padding: "18px 22px" }}>
            <Markdown text={report} />
          </div>
        </div>
      )}
    </div>
  );
}
