"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/time";

type ConversationCard = {
  id: string;
  title: string | null;
  updated_at: string;
  messageCount: number;
  lastMessage: string;
  // pełny tekst rozmowy — do wyszukiwania po treści
  searchBlob: string;
};

export default function HistoryPage() {
  const router = useRouter();
  const [cards, setCards] = useState<ConversationCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data: convs, error: convErr } = await supabase
        .from("conversations")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false });
      if (convErr) throw convErr;

      const ids = (convs ?? []).map((c) => c.id);
      // Wszystkie wiadomości tych rozmów jednym zapytaniem → agregacja w JS.
      const { data: msgs, error: msgErr } = ids.length
        ? await supabase
            .from("messages")
            .select("conversation_id, content, created_at")
            .in("conversation_id", ids)
            .order("created_at", { ascending: true })
        : { data: [], error: null };
      if (msgErr) throw msgErr;

      const byConv = new Map<string, { count: number; last: string; blob: string }>();
      for (const m of msgs ?? []) {
        const entry = byConv.get(m.conversation_id) ?? { count: 0, last: "", blob: "" };
        entry.count += 1;
        entry.last = m.content ?? ""; // ostatnia (bo sortujemy rosnąco)
        entry.blob += " " + (m.content ?? "");
        byConv.set(m.conversation_id, entry);
      }

      setCards(
        (convs ?? []).map((c) => {
          const agg = byConv.get(c.id) ?? { count: 0, last: "", blob: "" };
          return {
            id: c.id,
            title: c.title,
            updated_at: c.updated_at,
            messageCount: agg.count,
            lastMessage: agg.last,
            searchBlob: `${c.title ?? ""} ${agg.blob}`.toLowerCase(),
          };
        }),
      );
    } catch (e) {
      console.error("Historia: nie udało się wczytać rozmów", e);
      setToast("Nie udało się wczytać historii");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const ok = window.confirm(
      "Czy na pewno chcesz usunąć tę rozmowę? Tej operacji nie można cofnąć.",
    );
    if (!ok) return;
    setDeletingId(id);
    try {
      // Najpierw wiadomości (brak kaskady FK), potem sama rozmowa.
      const { error: mErr } = await supabase
        .from("messages")
        .delete()
        .eq("conversation_id", id);
      if (mErr) throw mErr;
      const { error: cErr } = await supabase.from("conversations").delete().eq("id", id);
      if (cErr) throw cErr;

      setCards((prev) => prev.filter((c) => c.id !== id)); // odśwież bez przeładowania
      showToast("Rozmowa usunięta");
    } catch (err) {
      console.error("Historia: nie udało się usunąć rozmowy", err);
      showToast("Nie udało się usunąć rozmowy");
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) => c.searchBlob.includes(q));
  }, [cards, query]);

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 16px 48px" }}>
      <style>{`
        .hist-card {
          display: block;
          text-decoration: none;
          color: inherit;
          background: #1a1a2a;
          border: 1px solid #333;
          border-radius: 12px;
          padding: 16px 18px;
          transition: background 0.15s, border-color 0.15s, transform 0.15s;
          position: relative;
        }
        .hist-card:hover {
          background: #20202f;
          border-color: #61F8F8;
          transform: translateY(-1px);
        }
        .hist-del {
          opacity: 0;
          transition: opacity 0.15s;
          background: transparent;
          border: 1px solid #7a3b3b;
          color: #e08a8a;
          border-radius: 8px;
          padding: 5px 10px;
          font-size: 13px;
          cursor: pointer;
        }
        .hist-card:hover .hist-del { opacity: 1; }
        .hist-del:hover { background: #2a1618; }
        @media (hover: none) { .hist-del { opacity: 1; } }
      `}</style>

      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700 }}>📜 Historia rozmów</h1>
        <p style={{ color: "#888", marginTop: 6, fontSize: 14 }}>
          Wszystkie Twoje rozmowy z agentem
        </p>
      </header>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Szukaj w rozmowach..."
        style={{
          width: "100%",
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid #333",
          background: "#141414",
          color: "#ededed",
          fontSize: 14,
          outline: "none",
          marginBottom: 20,
        }}
      />

      {loading ? (
        <div style={{ color: "#9a9ac0", textAlign: "center", padding: "40px 0" }}>
          Wczytuję historię…
        </div>
      ) : cards.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "48px 16px",
            border: "1px dashed #444",
            borderRadius: 12,
            color: "#aaa",
          }}
        >
          <p style={{ marginBottom: 16 }}>Nie masz jeszcze żadnych rozmów. Zacznij nową!</p>
          <Link
            href="/chat"
            style={{
              display: "inline-block",
              padding: "10px 18px",
              borderRadius: 10,
              background: "#3a2a6a",
              border: "1px solid #6a4fd5",
              color: "#ededed",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Rozpocznij rozmowę
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ color: "#888", textAlign: "center", padding: "40px 0" }}>
          Brak rozmów pasujących do „{query}".
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((c) => (
            <div
              key={c.id}
              className="hist-card"
              role="link"
              tabIndex={0}
              onClick={() => router.push(`/history/${c.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter") router.push(`/history/${c.id}`);
              }}
              style={{ cursor: "pointer" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      color: "#fff",
                      fontSize: 16,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.title || "Rozmowa bez tytułu"}
                  </div>
                  <div style={{ color: "#888", fontSize: 13, marginTop: 4 }}>
                    {timeAgo(c.updated_at)} · {c.messageCount}{" "}
                    {c.messageCount === 1 ? "wiadomość" : "wiadomości"}
                  </div>
                  {c.lastMessage && (
                    <div
                      style={{
                        color: "#9a9aa8",
                        fontStyle: "italic",
                        fontSize: 13,
                        marginTop: 8,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.lastMessage.slice(0, 100)}
                      {c.lastMessage.length > 100 ? "…" : ""}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="hist-del"
                  onClick={(e) => handleDelete(c.id, e)}
                  disabled={deletingId === c.id}
                >
                  {deletingId === c.id ? "Usuwam…" : "🗑️ Usuń"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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
