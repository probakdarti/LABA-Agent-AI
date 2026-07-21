"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatDateTime, formatTime } from "@/lib/time";

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export default function ConversationViewPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [title, setTitle] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const { data: conv, error: convErr } = await supabase
          .from("conversations")
          .select("title, updated_at")
          .eq("id", id)
          .maybeSingle();
        if (convErr) throw convErr;
        if (!conv) {
          setNotFound(true);
          return;
        }
        setTitle(conv.title);
        setUpdatedAt(conv.updated_at);

        const { data: msgs, error: msgErr } = await supabase
          .from("messages")
          .select("id, role, content, created_at")
          .eq("conversation_id", id)
          .order("created_at", { ascending: true });
        if (msgErr) throw msgErr;
        setMessages((msgs ?? []) as Msg[]);
      } catch (e) {
        console.error("Podgląd rozmowy: błąd wczytywania", e);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 16px 48px" }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <Link
          href="/history"
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #333",
            background: "transparent",
            color: "#ccc",
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          ← Wróć do listy
        </Link>
        <Link
          href={`/chat?c=${id}`}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #6a4fd5",
            background: "#3a2a6a",
            color: "#ededed",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          🔄 Kontynuuj rozmowę
        </Link>
      </div>

      {loading ? (
        <div style={{ color: "#9a9ac0", textAlign: "center", padding: "40px 0" }}>
          Wczytuję rozmowę…
        </div>
      ) : notFound ? (
        <div
          style={{
            textAlign: "center",
            padding: "48px 16px",
            border: "1px dashed #444",
            borderRadius: 12,
            color: "#aaa",
          }}
        >
          Nie znaleziono tej rozmowy (mogła zostać usunięta).
        </div>
      ) : (
        <>
          <header style={{ marginBottom: 20, borderBottom: "1px solid #333", paddingBottom: 14 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700 }}>
              {title || "Rozmowa bez tytułu"}
            </h1>
            {updatedAt && (
              <div style={{ color: "#888", fontSize: 13, marginTop: 6 }}>
                {formatDateTime(updatedAt)}
              </div>
            )}
          </header>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((m) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={m.id}
                  style={{
                    alignSelf: isUser ? "flex-end" : "flex-start",
                    maxWidth: isUser ? "75%" : "92%",
                    padding: "10px 14px",
                    borderRadius: 12,
                    background: isUser ? "#25324a" : "#1a1a2a",
                    border: isUser ? "1px solid #35507a" : "1px solid #333",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: "#7a7a90",
                      marginBottom: 4,
                      display: "flex",
                      gap: 8,
                    }}
                  >
                    <span>{isUser ? "Ty" : "🤖 Agent"}</span>
                    <span>{formatTime(m.created_at)}</span>
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: 15 }}>
                    {m.content}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
