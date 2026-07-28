"use client";

import { useState } from "react";
import { Markdown } from "../components/Markdown";

const EXAMPLES: { label: string; companies: [string, string, string] }[] = [
  { label: "Shopify vs WooCommerce vs PrestaShop", companies: ["Shopify", "WooCommerce", "PrestaShop"] },
  { label: "Notion vs Obsidian vs Evernote", companies: ["Notion", "Obsidian", "Evernote"] },
  { label: "Vercel vs Netlify vs Railway", companies: ["Vercel", "Netlify", "Railway"] },
  { label: "ChatGPT vs Claude vs Gemini", companies: ["ChatGPT", "Claude", "Gemini"] },
];

export default function CompetitorPage() {
  const [companies, setCompanies] = useState<string[]>(["", "", ""]);
  const [context, setContext] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const setCompany = (i: number, val: string) =>
    setCompanies((prev) => prev.map((c, idx) => (idx === i ? val : c)));

  const filled = companies.map((c) => c.trim()).filter(Boolean);

  const compare = async (preset?: [string, string, string]) => {
    if (preset) setCompanies(preset);
    const names = (preset ?? companies).map((c) => c.trim()).filter(Boolean);
    if (names.length < 2 || loading) return;
    setLoading(true);
    setResult("");
    setError(null);
    try {
      const res = await fetch("/api/competitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companies: names, context }),
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

  const canCompare = !loading && filled.length >= 2;
  // Kolory/obramowanie z klasy .input — tu tylko układ w wierszu.
  const inputStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 150,
    padding: "10px 12px",
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 16px 48px" }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700 }}>🏢 Analiza konkurencji</h1>
        <p className="muted" style={{ marginTop: 6, fontSize: 14 }}>
          Podaj firmy — agent porówna je za Ciebie
        </p>
      </header>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {["Np. Shopify", "Np. WooCommerce", "Np. PrestaShop"].map((ph, i) => (
          <input
            key={i}
            className="input"
            value={companies[i]}
            onChange={(e) => setCompany(i, e.target.value)}
            placeholder={ph}
            disabled={loading}
            style={inputStyle}
          />
        ))}
      </div>

      <textarea
        className="input"
        value={context}
        onChange={(e) => setContext(e.target.value)}
        placeholder="Opcjonalnie: kontekst — np. Szukam platformy e-commerce dla małego sklepu"
        disabled={loading}
        style={{
          minHeight: 64,
          marginTop: 10,
          padding: "10px 12px",
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => compare()}
          className="btn-primary"
          disabled={!canCompare}
          style={{ fontSize: 15, cursor: canCompare ? "pointer" : "not-allowed" }}
        >
          {loading ? "Porównuję…" : "🔍 Porównaj"}
        </button>
        {loading && (
          <span className="muted" style={{ fontSize: 14 }}>
            Agent zbiera dane o firmach…
          </span>
        )}
      </div>

      {/* Klikalne przykłady */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            className="btn"
            onClick={() => compare(ex.companies)}
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
              {copied ? "✅ Skopiowano!" : "📋 Kopiuj analizę"}
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
