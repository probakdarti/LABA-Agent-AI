"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "../components/AuthProvider";

type DocGroup = { title: string; chunks: number };
type Fragment = { content: string; chunkIndex: number | null };
type SearchHit = { title: string; content: string; similarity: number };

export default function KnowledgePage() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<DocGroup[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fragments, setFragments] = useState<Record<string, Fragment[]>>({});

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);

  const loadDocs = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("documents")
        .select("title")
        .eq("user_id", user.id)
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
  }, [user]);

  const toggleDoc = async (title: string) => {
    if (expanded === title) {
      setExpanded(null);
      return;
    }
    setExpanded(title);
    if (!fragments[title] && user) {
      const { data } = await supabase
        .from("documents")
        .select("content, metadata, created_at")
        .eq("title", title)
        .eq("user_id", user.id)
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
    if (!query.trim() || searching || !user) return;
    setSearching(true);
    setHits(null);
    try {
      const res = await fetch("/api/knowledge-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, userId: user.id }),
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
    s >= 0.7 ? "var(--ok)" : s >= 0.5 ? "var(--warn)" : "var(--muted)";

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 16px 48px" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700 }}>📚 Twoja baza wiedzy</h1>
        <p className="muted" style={{ marginTop: 6, fontSize: 14 }}>
          {loading
            ? "Wczytuję…"
            : `${totalChunks} ${totalChunks === 1 ? "fragment" : "fragmentów"} z ${docs.length} ${
                docs.length === 1 ? "dokumentu" : "dokumentów"
              }`}
        </p>
      </header>

      {/* Testowa wyszukiwarka RAG (bez agenta) */}
      <section className="surface" style={{ padding: 16, marginBottom: 28 }}>
        <div style={{ fontSize: 14, color: "var(--text)", marginBottom: 10 }}>
          🔍 Test wyszukiwania (bez agenta) — sprawdź, co RAG znajdzie dla pytania
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch();
            }}
            placeholder="Szukaj w bazie wiedzy… (np. VIP, rezygnacja, cena premium)"
            style={{ flex: 1, minWidth: 0 }}
          />
          <button
            type="button"
            className="btn-primary"
            onClick={runSearch}
            disabled={searching || !query.trim()}
            style={{
              cursor: searching || !query.trim() ? "not-allowed" : "pointer",
            }}
          >
            {searching ? "Szukam…" : "Szukaj"}
          </button>
        </div>

        {hits && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {hits.length === 0 ? (
              <div className="muted" style={{ fontStyle: "italic", fontSize: 13 }}>
                Brak pasujących fragmentów.
              </div>
            ) : (
              hits.map((h, i) => (
                <div
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "10px 12px",
                  }}
                  key={i}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>
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
                  <div className="muted" style={{ fontSize: 13, lineHeight: 1.4 }}>
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
        <div className="muted">Wczytuję…</div>
      ) : docs.length === 0 ? (
        <div className="muted" style={{ fontStyle: "italic" }}>
          Baza jest pusta.{" "}
          <Link href="/upload" style={{ color: "var(--info)" }}>
            Dodaj dokument →
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {docs.map((d) => (
            <div key={d.title} className="surface" style={{ overflow: "hidden" }}>
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
                  color: "var(--text)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{d.title}</span>
                  <span className="muted" style={{ fontSize: 13, marginLeft: 10 }}>
                    {d.chunks} {d.chunks === 1 ? "fragment" : "fragmentów"}
                  </span>
                </span>
                <span className="muted">{expanded === d.title ? "▲" : "▼"}</span>
              </button>

              {expanded === d.title && (
                <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {(fragments[d.title] ?? []).map((f, i) => (
                    <div
                      key={i}
                      className="muted"
                      style={{
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: "8px 10px",
                        fontSize: 13,
                        lineHeight: 1.4,
                      }}
                    >
                      <span style={{ marginRight: 6 }}>#{f.chunkIndex ?? i}</span>
                      {f.content}
                    </div>
                  ))}
                  {!fragments[d.title] && (
                    <div className="muted" style={{ fontSize: 13 }}>
                      Wczytuję fragmenty…
                    </div>
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
