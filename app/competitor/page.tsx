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
  const inputStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 150,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #333",
    background: "#141414",
    color: "#ededed",
    fontSize: 14,
    outline: "none",
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 16px 48px" }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700 }}>🏢 Analiza konkurencji</h1>
        <p style={{ color: "#888", marginTop: 6, fontSize: 14 }}>
          Podaj firmy — agent porówna je za Ciebie
        </p>
      </header>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {["Np. Shopify", "Np. WooCommerce", "Np. PrestaShop"].map((ph, i) => (
          <input
            key={i}
            value={companies[i]}
            onChange={(e) => setCompany(i, e.target.value)}
            placeholder={ph}
            disabled={loading}
            style={inputStyle}
          />
        ))}
      </div>

      <textarea
        value={context}
        onChange={(e) => setContext(e.target.value)}
        placeholder="Opcjonalnie: kontekst — np. Szukam platformy e-commerce dla małego sklepu"
        disabled={loading}
        style={{
          width: "100%",
          minHeight: 64,
          marginTop: 10,
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #333",
          background: "#141414",
          color: "#ededed",
          fontSize: 14,
          outline: "none",
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => compare()}
          disabled={!canCompare}
          style={{
            padding: "10px 20px",
            borderRadius: 10,
            border: "1px solid #6a4fd5",
            background: canCompare ? "#3a2a6a" : "#222",
            color: canCompare ? "#ededed" : "#666",
            fontSize: 15,
            fontWeight: 600,
            cursor: canCompare ? "pointer" : "not-allowed",
          }}
        >
          {loading ? "Porównuję…" : "🔍 Porównaj"}
        </button>
        {loading && <span style={{ color: "#9a9ac0", fontSize: 14 }}>Agent zbiera dane o firmach…</span>}
      </div>

      {/* Klikalne przykłady */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            onClick={() => compare(ex.companies)}
            disabled={loading}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid #333",
              background: "#161620",
              color: "#cfcfe0",
              fontSize: 13,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {ex.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ color: "#e8b4b4", fontSize: 14, marginTop: 16 }}>⚠️ {error}</div>
      )}

      {result && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button
              type="button"
              onClick={copy}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: "1px solid #333",
                background: "transparent",
                color: copied ? "#8fce8f" : "#ccc",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {copied ? "✅ Skopiowano!" : "📋 Kopiuj analizę"}
            </button>
          </div>
          <div
            style={{
              background: "#12121a",
              border: "1px solid #333",
              borderRadius: 12,
              padding: "18px 22px",
              overflowX: "auto",
            }}
          >
            <Markdown text={result} />
          </div>
        </div>
      )}
    </div>
  );
}
