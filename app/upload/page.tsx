"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/time";
import { useAuth } from "../components/AuthProvider";

type DocGroup = { title: string; chunks: number; createdAt: string };

const EXAMPLES: { label: string; title: string; content: string }[] = [
  {
    label: "Cennik",
    title: "Cennik 2026",
    content:
      "Pakiet Basic: 99 zł/miesiąc — 5 użytkowników, 10 GB miejsca, wsparcie email. " +
      "Pakiet Premium: 299 zł/miesiąc — 25 użytkowników, 100 GB miejsca, wsparcie email i telefon, priorytetowa obsługa. " +
      "Pakiet VIP: 599 zł/miesiąc — nielimitowani użytkownicy, 1 TB miejsca, wsparcie 24/7, dedykowany opiekun. " +
      "Wszystkie pakiety z 14-dniowym okresem próbnym. Rezygnacja możliwa w dowolnym momencie.",
  },
  {
    label: "FAQ",
    title: "FAQ",
    content:
      "Q: Jak mogę anulować subskrypcję? A: Wyślij email na pomoc@firma.pl lub anuluj w panelu ustawień. " +
      "Q: Czy jest okres próbny? A: Tak, 14 dni za darmo dla każdego pakietu. " +
      "Q: Jak zmienić pakiet? A: W panelu w zakładce Subskrypcja — zmiana działa od następnego okresu rozliczeniowego.",
  },
];

export default function UploadPage() {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocGroup[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const loadDocs = async () => {
    if (!user) return;
    setLoadingDocs(true);
    try {
      // Tylko dokumenty zalogowanego użytkownika (izolacja danych — W3).
      const { data, error: err } = await supabase
        .from("documents")
        .select("title, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (err) throw err;
      const map = new Map<string, DocGroup>();
      for (const row of data ?? []) {
        const t = (row.title as string) ?? "(bez tytułu)";
        const g = map.get(t);
        if (g) g.chunks += 1;
        else map.set(t, { title: t, chunks: 1, createdAt: row.created_at as string });
      }
      setDocs([...map.values()]);
    } catch (e) {
      console.error("Baza wiedzy: nie udało się wczytać listy", e);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    void loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const canSubmit =
    !busy && !!user && title.trim().length > 0 && content.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setResult(null);
    setError(null);
    setProgress(null);
    try {
      const res = await fetch("/api/upload-knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, userId: user!.id }),
      });
      if (!res.body) throw new Error("Brak odpowiedzi serwera.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      // Czytamy strumień NDJSON linia po linii → aktualizujemy pasek postępu.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line);
          if (msg.type === "progress") {
            setProgress({ current: msg.current, total: msg.total });
          } else if (msg.type === "done") {
            setResult(`✅ Zapisano ${msg.chunks_saved} fragmentów!`);
            setContent("");
          } else if (msg.type === "error") {
            setError(msg.error);
          }
        }
      }
      await loadDocs();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Coś poszło nie tak.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handleDelete = async (docTitle: string) => {
    const ok = window.confirm(
      `Usunąć dokument „${docTitle}" wraz ze wszystkimi fragmentami? Tej operacji nie można cofnąć.`,
    );
    if (!ok || !user) return;
    try {
      const { error: err } = await supabase
        .from("documents")
        .delete()
        .eq("title", docTitle)
        .eq("user_id", user.id);
      if (err) throw err;
      setDocs((prev) => prev.filter((d) => d.title !== docTitle));
      showToast("Dokument usunięty");
    } catch (e) {
      console.error(e);
      showToast("Nie udało się usunąć dokumentu");
    }
  };

  const progressPct = useMemo(
    () => (progress ? Math.round((progress.current / progress.total) * 100) : 0),
    [progress],
  );

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 16px 48px" }}>
      <style>{`
        .kb-del { opacity: 0; transition: opacity .15s; background: transparent;
          border: 1px solid #7a3b3b; color: #e08a8a; border-radius: 8px;
          padding: 5px 10px; font-size: 13px; cursor: pointer; }
        .kb-doc:hover .kb-del { opacity: 1; }
        @media (hover: none) { .kb-del { opacity: 1; } }
      `}</style>

      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700 }}>📚 Baza wiedzy</h1>
        <p style={{ color: "#888", marginTop: 6, fontSize: 14 }}>
          Wklej tekst — agent będzie z niego korzystał
        </p>
      </header>

      {/* Podpowiedzi — przykładowe dokumenty */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ color: "#777", fontSize: 13, alignSelf: "center" }}>Przykłady:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            onClick={() => {
              setTitle(ex.title);
              setContent(ex.content);
            }}
            disabled={busy}
            style={{
              padding: "5px 12px",
              borderRadius: 999,
              border: "1px solid #333",
              background: "#161620",
              color: "#cfcfe0",
              fontSize: 13,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {ex.label}
          </button>
        ))}
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Np. Cennik 2026, FAQ, Regulamin firmy"
        disabled={busy}
        style={{
          width: "100%",
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid #333",
          background: "#141414",
          color: "#ededed",
          fontSize: 14,
          outline: "none",
          marginBottom: 12,
        }}
      />

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Wklej tutaj treść dokumentu..."
        disabled={busy}
        style={{
          width: "100%",
          minHeight: 300,
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

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            padding: "10px 20px",
            borderRadius: 10,
            border: "1px solid #6a4fd5",
            background: canSubmit ? "#3a2a6a" : "#222",
            color: canSubmit ? "#ededed" : "#666",
            fontSize: 15,
            fontWeight: 600,
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          📤 Zapisz w bazie wiedzy
        </button>

        {busy && progress && (
          <span style={{ color: "#9a9ac0", fontSize: 14 }}>
            Przetwarzam fragment {progress.current} z {progress.total}…
          </span>
        )}
        {busy && !progress && (
          <span style={{ color: "#9a9ac0", fontSize: 14 }}>Przygotowuję…</span>
        )}
        {!busy && result && <span style={{ color: "#8fce8f", fontSize: 14 }}>{result}</span>}
        {!busy && error && <span style={{ color: "#e8b4b4", fontSize: 14 }}>⚠️ {error}</span>}
      </div>

      {busy && progress && (
        <div
          style={{
            height: 8,
            borderRadius: 999,
            background: "#2a2a3a",
            overflow: "hidden",
            marginTop: 12,
          }}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: "100%",
              background: "#6a4fd5",
              transition: "width 0.2s",
            }}
          />
        </div>
      )}

      {/* Lista zapisanych dokumentów */}
      <section style={{ marginTop: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
          Zapisane dokumenty
        </h2>
        {loadingDocs ? (
          <div style={{ color: "#9a9ac0" }}>Wczytuję…</div>
        ) : docs.length === 0 ? (
          <div style={{ color: "#888", fontStyle: "italic" }}>
            Brak dokumentów. Wklej pierwszy powyżej.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {docs.map((d) => (
              <div
                key={d.title}
                className="kb-doc"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  background: "#1a1a2a",
                  border: "1px solid #333",
                  borderRadius: 12,
                  padding: "14px 16px",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "#fff", fontSize: 15 }}>
                    {d.title}
                  </div>
                  <div style={{ color: "#888", fontSize: 13, marginTop: 4 }}>
                    {d.chunks} {d.chunks === 1 ? "fragment" : "fragmentów"} · dodano{" "}
                    {timeAgo(d.createdAt)}
                  </div>
                </div>
                <button
                  type="button"
                  className="kb-del"
                  onClick={() => handleDelete(d.title)}
                >
                  🗑️ Usuń
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#20202f",
            border: "1px solid #61F8F8",
            color: "#ededed",
            padding: "10px 18px",
            borderRadius: 10,
            fontSize: 14,
            zIndex: 100,
            boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
