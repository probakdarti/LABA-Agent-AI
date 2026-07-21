"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type DocGroup = { title: string; chunks: number };
type Fragment = { content: string; chunkIndex: number | null };
type SearchHit = { title: string; content: string; similarity: number };

export default function KnowledgePage() {
  const [docs, setDocs] = useState<DocGroup[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fragments, setFragments] = useState<Record<string, Fragment[]>>({});

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);

  const loadDocs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("documents")
        .select("title")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map = new Map<string, number>();
      for (const r of data ?? []) {
        const t = (r.title as string) ?? "(bez tytułu)";
        map.set(t, (map.get(t) ?? 0) + 1);
      }
      setDocs([...map.entries()].map(([title, chunks]) => ({ title, chunks })));
      setTotalChunks((data ?? []).length);
    } catch (e) {
      console.error("Baza wiedzy: błąd wczytywania", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleDoc = async (title: string) => {
    if (expanded === title) {
      setExpanded(null);
      return;
    }
    setExpanded(title);
    if (!fragments[title]) {
      const { data } = await supabase
        .from("documents")
        .select("content, metadata, created_at")
        .eq("title", title)
        .order("created_at", { ascending: true });
      const frags: Fragment[] = (data ?? []).map((r) => ({
        content: r.content as string,
        chunkIndex:
          (r.metadata as { chunk_index?: number } | null)?.chunk_index ?? null,
      }));
      setFragments((prev) => ({ ...prev, [title]: frags }));
    }
  };

  const runSearch = async () => {
    if (!query.trim() || searching) return;
    setSearching(true);
    setHits(null);
    try {
      const res = await fetch("/api/knowledge-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      setHits(data.results ?? []);
    } catch (e) {
      console.error(e);
      setHits([]);
    } finally {
      setSearching(false);
    }
  };

  const simColor = (s: number) =>
    s >= 0.7 ? "#61F8F8" : s >= 0.5 ? "#8fce8f" : "#c9a24a";

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 16px 48px" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700 }}>📚 Twoja baza wiedzy</h1>
        <p style={{ color: "#888", marginTop: 6, fontSize: 14 }}>
          {loading
            ? "Wczytuję…"
            : `${totalChunks} ${totalChunks === 1 ? "fragment" : "fragmentów"} z ${docs.length} ${
                docs.length === 1 ? "dokumentu" : "dokumentów"
              }`}
        </p>
      </header>

      {/* Testowa wyszukiwarka RAG (bez agenta) */}
      <section
        style={{
          background: "#12121a",
          border: "1px solid #333",
          borderRadius: 12,
          padding: 16,
          marginBottom: 28,
        }}
      >
        <div style={{ fontSize: 14, color: "#cfcfe0", marginBottom: 10 }}>
          🔍 Test wyszukiwania (bez agenta) — sprawdź, co RAG znajdzie dla pytania
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch();
            }}
            placeholder="Szukaj w bazie wiedzy… (np. VIP, rezygnacja, cena premium)"
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #333",
              background: "#141414",
              color: "#ededed",
              fontSize: 14,
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={runSearch}
            disabled={searching || !query.trim()}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid #6a4fd5",
              background: searching || !query.trim() ? "#222" : "#3a2a6a",
              color: searching || !query.trim() ? "#666" : "#ededed",
              fontSize: 14,
              fontWeight: 600,
              cursor: searching || !query.trim() ? "not-allowed" : "pointer",
            }}
          >
            {searching ? "Szukam…" : "Szukaj"}
          </button>
        </div>

        {hits && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {hits.length === 0 ? (
              <div style={{ color: "#888", fontStyle: "italic", fontSize: 13 }}>
                Brak pasujących fragmentów.
              </div>
            ) : (
              hits.map((h, i) => (
                <div
                  key={i}
                  style={{
                    background: "#1a1a2a",
                    border: "1px solid #333",
                    borderRadius: 10,
                    padding: "10px 12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "#fff", fontSize: 13 }}>
                      📄 {h.title}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: simColor(h.similarity),
                      }}
                    >
                      {h.similarity.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "#bbb", lineHeight: 1.4 }}>
                    {h.content}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {/* Lista dokumentów z podglądem fragmentów */}
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Dokumenty</h2>
      {loading ? (
        <div style={{ color: "#9a9ac0" }}>Wczytuję…</div>
      ) : docs.length === 0 ? (
        <div style={{ color: "#888", fontStyle: "italic" }}>
          Baza jest pusta.{" "}
          <Link href="/upload" style={{ color: "#6ab0ff" }}>
            Dodaj dokument →
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {docs.map((d) => (
            <div
              key={d.title}
              style={{
                background: "#1a1a2a",
                border: "1px solid #333",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                onClick={() => toggleDoc(d.title)}
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  background: "transparent",
                  border: "none",
                  color: "#ededed",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{d.title}</span>
                  <span style={{ color: "#888", fontSize: 13, marginLeft: 10 }}>
                    {d.chunks} {d.chunks === 1 ? "fragment" : "fragmentów"}
                  </span>
                </span>
                <span style={{ color: "#666" }}>{expanded === d.title ? "▲" : "▼"}</span>
              </button>

              {expanded === d.title && (
                <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {(fragments[d.title] ?? []).map((f, i) => (
                    <div
                      key={i}
                      style={{
                        background: "#12121a",
                        border: "1px solid #2a2a3a",
                        borderRadius: 8,
                        padding: "8px 10px",
                        fontSize: 13,
                        color: "#bbb",
                        lineHeight: 1.4,
                      }}
                    >
                      <span style={{ color: "#666", marginRight: 6 }}>
                        #{f.chunkIndex ?? i}
                      </span>
                      {f.content}
                    </div>
                  ))}
                  {!fragments[d.title] && (
                    <div style={{ color: "#888", fontSize: 13 }}>Wczytuję fragmenty…</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
