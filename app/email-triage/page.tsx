"use client";

import { useMemo, useState } from "react";
import { Markdown } from "../components/Markdown";

const EXAMPLE_EMAILS = [
  `Od: jan.kowalski@firma.pl
Temat: PILNE - Problem z fakturą
Treść: Dzień dobry, mam problem z fakturą FV/2026/001. Kwota jest nieprawidłowa — powinno być 5000 zł a jest 3000 zł. Proszę o PILNĄ korektę. Termin płatności mija jutro.`,
  `Od: winner@lucky-prize.com
Temat: Congratulations! You won $1,000,000
Treść: Click here to claim your prize! Limited time offer. Act now!`,
  `Od: anna.nowak@partner.pl
Temat: Propozycja współpracy
Treść: Dzień dobry, reprezentuję firmę ABC Solutions. Chcielibyśmy omówić możliwość współpracy w zakresie dostarczania usług IT. Czy możemy umówić się na spotkanie w przyszłym tygodniu?`,
  `Od: klient123@gmail.com
Temat: Nie działa usługa od 3 dni
Treść: Witam, od poniedziałku nie mogę się zalogować do panelu klienta. Próbowałem resetować hasło ale nie dostaję maila. To już trzeci dzień! Jeśli nie rozwiążecie tego dziś, zrezygnuję z usługi.`,
  `Od: newsletter@branzowy-portal.pl
Temat: Nowe trendy AI w biznesie - raport 2026
Treść: Zapraszamy do lektury naszego najnowszego raportu o zastosowaniach AI w polskich firmach. Pobierz za darmo na naszej stronie.`,
].join("\n\n");

// Kolor ramki wg priorytetu wykrytego w treści bloku.
function priorityColor(block: string): string {
  if (block.includes("🔴")) return "#e05a5a";
  if (block.includes("🟡")) return "#d6b23a";
  if (block.includes("🟢")) return "#4caf6a";
  if (block.includes("🗑️") || block.includes("🗑")) return "#666";
  return "#333";
}

// Wyciąga treść draftu (linie blockquote ">") do skopiowania.
function extractDraft(block: string): string {
  return block
    .split("\n")
    .filter((l) => /^\s*>/.test(l))
    .map((l) => l.replace(/^\s*>\s?/, ""))
    .join("\n")
    .trim();
}

type Section = { kind: "mail" | "summary"; text: string };

function parseSections(text: string): Section[] {
  return text
    .split(/\n-{3,}\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => ({
      kind: s.includes("Podsumowanie") ? "summary" : "mail",
      text: s,
    })) as Section[];
}

function CopyDraftButton({ draft }: { draft: string }) {
  const [copied, setCopied] = useState(false);
  if (!draft) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      style={{
        marginTop: 8,
        padding: "5px 12px",
        borderRadius: 8,
        border: "1px solid #333",
        background: "transparent",
        color: copied ? "#8fce8f" : "#ccc",
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {copied ? "✅ Skopiowano!" : "📋 Kopiuj draft"}
    </button>
  );
}

export default function EmailTriagePage() {
  const [emailsText, setEmailsText] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    const emails = emailsText
      .split(/\n\s*\n+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0 || loading) return;

    setLoading(true);
    setResult("");
    setError(null);
    try {
      const res = await fetch("/api/email-triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`Serwer zwrócił błąd (${res.status}).`);
      }
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

  const sections = useMemo(() => parseSections(result), [result]);
  const summary = sections.find((s) => s.kind === "summary");
  const mails = sections.filter((s) => s.kind === "mail");

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 16px 48px" }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700 }}>📧 E-mail Triage</h1>
        <p style={{ color: "#888", marginTop: 6, fontSize: 14 }}>
          Wklej maile — agent posortuje i napisze odpowiedzi
        </p>
      </header>

      <textarea
        value={emailsText}
        onChange={(e) => setEmailsText(e.target.value)}
        placeholder="Wklej maile tutaj — oddziel je pustą linią..."
        disabled={loading}
        style={{
          width: "100%",
          minHeight: 200,
          padding: "12px 14px",
          borderRadius: 10,
          border: "1px solid #333",
          background: "#141414",
          color: "#ededed",
          fontSize: 14,
          lineHeight: 1.5,
          outline: "none",
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={loading || emailsText.trim().length === 0}
          style={{
            padding: "10px 20px",
            borderRadius: 10,
            border: "1px solid #6a4fd5",
            background:
              loading || !emailsText.trim() ? "#222" : "#3a2a6a",
            color: loading || !emailsText.trim() ? "#666" : "#ededed",
            fontSize: 15,
            fontWeight: 600,
            cursor: loading || !emailsText.trim() ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Analizuję…" : "📧 Analizuj maile"}
        </button>
        <button
          type="button"
          onClick={() => setEmailsText(EXAMPLE_EMAILS)}
          disabled={loading}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "1px solid #333",
            background: "#161620",
            color: "#cfcfe0",
            fontSize: 14,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          📋 Wklej przykład
        </button>
      </div>

      {error && (
        <div style={{ color: "#e8b4b4", fontSize: 14, marginTop: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {loading && result === "" && (
        <div style={{ color: "#9a9ac0", marginTop: 20 }}>Czytam i sortuję maile…</div>
      )}

      {/* Podsumowanie na górze */}
      {summary && (
        <div
          style={{
            marginTop: 24,
            background: "#161620",
            border: "1px solid #6a4fd5",
            borderRadius: 12,
            padding: "14px 18px",
          }}
        >
          <Markdown text={summary.text} />
        </div>
      )}

      {/* Karty maili */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
        {mails.map((sec, i) => {
          const color = priorityColor(sec.text);
          const draft = extractDraft(sec.text);
          return (
            <div
              key={i}
              style={{
                background: "#1a1a2a",
                border: "1px solid #333",
                borderLeft: `5px solid ${color}`,
                borderRadius: 12,
                padding: "14px 18px",
              }}
            >
              <Markdown text={sec.text} />
              <CopyDraftButton draft={draft} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
