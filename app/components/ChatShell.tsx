"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { supabase } from "@/lib/supabase";

type SourceUrlPart = { type: "source-url"; sourceId: string; url: string; title?: string };
function isSourceUrlPart(part: { type: string }): part is SourceUrlPart {
  return part.type === "source-url";
}

type FilePart = { type: "file"; mediaType: string; url: string; filename?: string };
function isImageFilePart(part: { type: string }): part is FilePart {
  return (
    part.type === "file" &&
    typeof (part as FilePart).mediaType === "string" &&
    (part as FilePart).mediaType.startsWith("image/")
  );
}

// Uogólniony kształt part-a narzędzia (tool-<name> lub dynamic-tool)
type ToolPartLike = {
  type: string;
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  toolCallId?: string;
};
function isToolPart(part: { type: string }): boolean {
  return part.type.startsWith("tool-") || part.type === "dynamic-tool";
}
function toolNameOf(part: ToolPartLike): string {
  if (part.type === "dynamic-tool") return part.toolName ?? "narzędzie";
  return part.type.replace(/^tool-/, "");
}

const TOOL_EMOJI: Record<string, string> = {
  calculator: "🧮",
  currentDateTime: "🕐",
  webSearch: "🌐",
  readWebPage: "📄",
  generateImage: "🎨",
  getWeather: "🌦️",
  getExchangeRate: "💱",
  getHolidays: "📅",
  searchWikipedia: "📖",
  saveNote: "📝",
  getNotes: "🗂️",
  saveUserName: "🙋",
  saveUserPreference: "⭐",
  searchKnowledge: "📚",
};

// ── Renderowanie sekcji ReAct (🧠 Myślę / 👁️ Obserwuję / ✅ Wynik) w kolorach ──
type ReactSection = { kind: "thought" | "observe" | "result" | "plain"; lines: string[] };

function splitReactSections(text: string): ReactSection[] {
  const sections: ReactSection[] = [];
  let current: ReactSection = { kind: "plain", lines: [] };
  for (const line of text.split("\n")) {
    // Nagłówek sekcji: emoji na początku linii, z opcjonalnym "###" lub "**"
    // (model nie zawsze używa markdownowego "###").
    const header = /^\s*(?:#{1,4}\s*|\*\*\s*)?(🧠|👁️|✅|⚡)/.exec(line);
    if (header) {
      if (current.lines.length) sections.push(current);
      const e = header[1];
      const kind =
        e === "🧠" ? "thought" : e === "👁️" ? "observe" : e === "✅" ? "result" : "plain";
      current = { kind, lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length) sections.push(current);
  return sections;
}

const SECTION_STYLE: Record<
  ReactSection["kind"],
  { bg: string; border: string } | null
> = {
  thought: { bg: "#1a1a3a", border: "#3a3a8a" },
  observe: { bg: "#2a1a0a", border: "#8a5a2a" },
  result: { bg: "#0a2a0a", border: "#2a7a2a" },
  plain: null,
};

function ReactText({ text }: { text: string }) {
  return (
    <>
      {splitReactSections(text).map((sec, i) => {
        const style = SECTION_STYLE[sec.kind];
        const content = sec.lines.join("\n");
        if (!style) return <Markdown key={i} text={content} />;
        return (
          <div
            key={i}
            style={{
              background: style.bg,
              border: `1px solid ${style.border}`,
              borderRadius: 10,
              padding: "8px 12px",
              margin: "6px 0",
            }}
          >
            <Markdown text={content} />
          </div>
        );
      })}
    </>
  );
}

// ── Cytowanie źródeł (RAG) — wyodrębnia linie "📎 Źródło:/Źródła:" z odpowiedzi ──
const SOURCE_LINE = /^\s*📎\s*Źródł[ao]\s*:/;

function SourceCitation({ text }: { text: string }) {
  // text = np. "📎 Źródło: Cennik 2026" — pokazujemy jako subtelny chip pod odpowiedzią.
  const label = text.replace(/^\s*📎\s*/, "").trim();
  return (
    <div
      style={{
        marginTop: 8,
        paddingTop: 8,
        borderTop: "1px solid #333",
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "#8a8aa0",
      }}
    >
      <span>📄</span>
      <span>{label}</span>
    </div>
  );
}

function AssistantText({ text, reactMode }: { text: string; reactMode: boolean }) {
  const sources: string[] = [];
  const bodyLines: string[] = [];
  for (const line of text.split("\n")) {
    if (SOURCE_LINE.test(line)) sources.push(line.trim());
    else bodyLines.push(line);
  }
  const body = bodyLines.join("\n").trim();
  return (
    <>
      {body && (reactMode ? <ReactText text={body} /> : <Markdown text={body} />)}
      {sources.map((s, i) => (
        <SourceCitation key={i} text={s} />
      ))}
    </>
  );
}

type Attachment = { type: "file"; mediaType: string; url: string; filename?: string };
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

function downloadDataUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

type ChatShellProps = {
  apiEndpoint: string;
  headerTitle: string;
  headerSubtitle: string;
  inputPlaceholder: string;
  /** Przykładowe pytania/scenariusze widoczne przed pierwszą wiadomością — kliknięcie wysyła od razu. */
  examples?: string[];
  /** Chipy pod polem input — kliknięcie tylko WYPEŁNIA input (nie wysyła). */
  termChips?: string[];
  /** Tryb Vision — rozbudowana strefa wklej/upuść w pustym stanie. */
  visionMode?: boolean;
  /** Panel dostępnych narzędzi (agent „pełnej mocy"). */
  toolPanel?: { emoji: string; label: string }[];
  /** Tryb ReAct — kolorowe sekcje 🧠/👁️/✅ i pasek postępu kroków. */
  reactMode?: boolean;
  /** Panel „Diagnostyka" — kroki, narzędzia, błędy, czas, status. */
  diagnostics?: boolean;
  /** Trwała pamięć — zapisuje rozmowę do Supabase i wczytuje ją po odświeżeniu. */
  persist?: boolean;
  /** Personalizacja — identyfikuje użytkownika (localStorage) i zna jego imię/preferencje. */
  personalize?: boolean;
};

// Wyciąga statystyki z ostatniej wiadomości asystenta (do panelu diagnostyki)
function toolStats(parts: { type: string }[]) {
  const counts: Record<string, number> = {};
  const errors: { name: string; message: string }[] = [];
  for (const p of parts) {
    if (!isToolPart(p)) continue;
    const tp = p as unknown as ToolPartLike;
    const name = toolNameOf(tp);
    if (tp.state === "output-available") {
      counts[name] = (counts[name] ?? 0) + 1;
      const out = tp.output as { error?: string } | undefined;
      if (out && typeof out === "object" && out.error) {
        errors.push({ name, message: out.error });
      }
    } else if (tp.state === "output-error") {
      counts[name] = (counts[name] ?? 0) + 1;
      errors.push({ name, message: tp.errorText ?? "błąd narzędzia" });
    }
  }
  const totalCalls = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, errors, totalCalls };
}

// ── Timeline pojedynczego wywołania narzędzia ────────────────────────────────
function ToolCallView({ part }: { part: ToolPartLike }) {
  const name = toolNameOf(part);
  const emoji = TOOL_EMOJI[name] ?? "🔧";
  const running = part.state === "input-streaming" || part.state === "input-available";
  const errored = part.state === "output-error";

  const argsText = (() => {
    if (part.input == null) return "";
    if (typeof part.input === "object") {
      const vals = Object.values(part.input as Record<string, unknown>)
        .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
        .join(", ");
      return vals.length > 80 ? vals.slice(0, 80) + "…" : vals;
    }
    return String(part.input);
  })();

  const out = part.output as
    | {
        image?: string;
        text?: string;
        error?: string;
        result?: unknown;
        answer?: string;
        sources?: { url: string; title: string }[];
        // pogoda
        temperature?: number;
        unit?: string;
        description?: string;
        city?: string;
        // kurs walut
        rate?: number;
        from?: string;
        to?: string;
        // święta
        next?: { date: string; name: string };
        daysToNext?: number;
        // wikipedia
        title?: string;
        // notatki
        saved?: boolean;
        count?: number;
        // profil użytkownika (imię / preferencje)
        name?: string;
        key?: string;
        value?: string;
      }
    | undefined;

  return (
    <div
      style={{
        border: "1px solid #333",
        borderLeft: `3px solid ${errored ? "#7a3b3b" : running ? "#8a6f2f" : "#3a5a8a"}`,
        borderRadius: 8,
        background: "#12121a",
        padding: "8px 12px",
        fontSize: 13,
        marginBottom: 8,
      }}
    >
      <div style={{ color: "#cfcfe0", fontWeight: 600 }}>
        {emoji} {name}
        {argsText && <span style={{ color: "#888", fontWeight: 400 }}> ({argsText})</span>}
        {running && <span style={{ color: "#c9a24a" }}> — wykonuję…</span>}
      </div>

      {errored && (
        <div style={{ color: "#e8b4b4", marginTop: 4 }}>→ {part.errorText}</div>
      )}

      {part.state === "output-available" && out && (
        <div style={{ marginTop: 6, color: "#aaa" }}>
          {out.error ? (
            <span style={{ color: "#e8b4b4" }}>→ {out.error}</span>
          ) : out.image ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={out.image}
                alt="wygenerowany obraz"
                style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #333" }}
              />
              <button
                type="button"
                onClick={() => downloadDataUrl(out.image!, "ai-generated.png")}
                style={{
                  alignSelf: "flex-start",
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: "1px solid #333",
                  background: "#2a2a3a",
                  color: "#ededed",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                💾 Pobierz
              </button>
            </div>
          ) : out.answer !== undefined ? (
            <span>→ {out.sources?.length ?? 0} źródeł znalezionych</span>
          ) : out.result !== undefined ? (
            <span>→ wynik: {String(out.result)}</span>
          ) : out.temperature !== undefined ? (
            <span>
              → {out.city}: {out.temperature}
              {out.unit ?? "°C"}, {out.description}
            </span>
          ) : out.rate !== undefined ? (
            <span>
              → 1 {out.from} = {out.rate} {out.to}
            </span>
          ) : out.next !== undefined ? (
            <span>
              → najbliższe: {out.next?.name} ({out.next?.date}
              {out.daysToNext != null ? `, za ${out.daysToNext} dni` : ""})
            </span>
          ) : out.title !== undefined ? (
            <span>→ {out.title}</span>
          ) : out.saved && out.name ? (
            <span>→ zapamiętano imię: {out.name}</span>
          ) : out.saved && out.key ? (
            <span>
              → zapamiętano: {out.key} = {out.value}
            </span>
          ) : out.saved ? (
            <span>→ zapisano ({out.count} notatek)</span>
          ) : typeof part.output === "string" ? (
            <span>→ {(part.output as string).slice(0, 120)}…</span>
          ) : (
            <span>→ gotowe</span>
          )}
        </div>
      )}
    </div>
  );
}

export function ChatShell({
  apiEndpoint,
  headerTitle,
  headerSubtitle,
  inputPlaceholder,
  examples = [],
  termChips = [],
  visionMode = false,
  toolPanel = [],
  reactMode = false,
  diagnostics = false,
  persist = false,
  personalize = false,
}: ChatShellProps) {
  const { messages, sendMessage, status, setMessages, error, clearError } =
    useChat({
      transport: new DefaultChatTransport({ api: apiEndpoint }),
    });
  const [input, setInput] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [attachError, setAttachError] = useState("");
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const startTimeRef = useRef<number | null>(null);

  // ── Trwała pamięć (Supabase) ────────────────────────────────────────────────
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(persist);
  const conversationIdRef = useRef<string | null>(null);
  // Id wiadomości już zapisanych do bazy — zapobiega dublowaniu.
  const savedIdsRef = useRef<Set<string>>(new Set());
  // Personalizacja: stałe ID użytkownika z localStorage (wysyłane do API).
  const userIdRef = useRef<string | null>(null);

  const isBusy = status === "submitted" || status === "streaming";

  // Wstępne wypełnienie inputa z parametru ?q= (np. z Szybkich akcji dashboardu)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setInput(q);
  }, []);

  // Timer diagnostyki: mierzy czas od wysłania do zakończenia odpowiedzi
  useEffect(() => {
    if (status === "submitted") {
      startTimeRef.current = Date.now();
      setElapsedMs(null);
    } else if (
      (status === "ready" || status === "error") &&
      startTimeRef.current != null
    ) {
      setElapsedMs(Date.now() - startTimeRef.current);
      startTimeRef.current = null;
    }
  }, [status]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  // Wyciąga czysty tekst z części wiadomości (do zapisu w kolumnie content).
  const partsToText = (parts: { type: string; text?: string }[]) =>
    parts
      .filter((p) => p.type === "text")
      .map((p) => p.text ?? "")
      .join("")
      .trim();

  // ── Wczytanie ostatniej rozmowy przy starcie (F5 nie kasuje historii) ───────
  useEffect(() => {
    if (!persist) return;
    let cancelled = false;
    (async () => {
      try {
        // "Kontynuuj rozmowę" z /history przekazuje ?c=<id> — wtedy ładujemy TĘ rozmowę.
        const requestedId = new URLSearchParams(window.location.search).get("c");

        const query = supabase.from("conversations").select("*");
        const { data: convs, error: convErr } = requestedId
          ? await query.eq("id", requestedId).limit(1)
          : await query.order("updated_at", { ascending: false }).limit(1);
        if (convErr) throw convErr;

        const conv = convs?.[0];
        if (conv && !cancelled) {
          conversationIdRef.current = conv.id;
          setConversationId(conv.id);

          const { data: msgs, error: msgErr } = await supabase
            .from("messages")
            .select("*")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: true });
          if (msgErr) throw msgErr;

          if (msgs && msgs.length > 0 && !cancelled) {
            const loaded = msgs.map((m) => ({
              id: m.id,
              role: m.role,
              parts: [{ type: "text", text: m.content }],
            }));
            loaded.forEach((m) => savedIdsRef.current.add(m.id));
            setMessages(loaded as unknown as typeof messages);
          }
        }
      } catch (e) {
        console.error("Supabase: nie udało się wczytać historii", e);
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist]);

  // ── Identyfikacja użytkownika (localStorage) + profil w Supabase ────────────
  useEffect(() => {
    if (!personalize) return;
    (async () => {
      try {
        let uid = localStorage.getItem("user_id");
        if (!uid) {
          // Pierwsza wizyta — nowy identyfikator i pusty profil.
          uid = crypto.randomUUID();
          localStorage.setItem("user_id", uid);
          await supabase.from("user_profiles").insert({ id: uid });
        } else {
          // Powracający — upewniamy się, że profil istnieje (np. po czyszczeniu bazy).
          const { data } = await supabase
            .from("user_profiles")
            .select("id")
            .eq("id", uid)
            .maybeSingle();
          if (!data) await supabase.from("user_profiles").insert({ id: uid });
        }
        userIdRef.current = uid;
      } catch (e) {
        console.error("Supabase: nie udało się zainicjować profilu użytkownika", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalize]);

  // ── Zapis nowych wiadomości po zakończeniu odpowiedzi (w tle) ────────────────
  useEffect(() => {
    if (!persist) return;
    if (status !== "ready") return; // zapisujemy dopiero po ustabilizowaniu
    if (messages.length === 0) return;

    (async () => {
      try {
        for (const m of messages) {
          if (savedIdsRef.current.has(m.id)) continue;
          if (m.role !== "user" && m.role !== "assistant") continue;
          const text = partsToText(m.parts as { type: string; text?: string }[]);
          if (!text) continue;

          // Pierwsza wiadomość → tworzymy rekord rozmowy (tytuł = pierwsze 50 znaków).
          if (!conversationIdRef.current) {
            const { data: created, error: createErr } = await supabase
              .from("conversations")
              .insert({ title: text.slice(0, 50) })
              .select()
              .single();
            if (createErr) throw createErr;
            conversationIdRef.current = created.id;
            setConversationId(created.id);
          }

          const cid = conversationIdRef.current;
          const { error: insErr } = await supabase.from("messages").insert({
            conversation_id: cid,
            role: m.role,
            content: text,
          });
          if (insErr) throw insErr;
          savedIdsRef.current.add(m.id);

          // Odświeżamy updated_at rozmowy przy każdej nowej wiadomości.
          await supabase
            .from("conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", cid);
        }
      } catch (e) {
        console.error("Supabase: nie udało się zapisać wiadomości", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, status, persist]);

  // ── Obsługa obrazów ────────────────────────────────────────────────────────
  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const addImageFile = async (file: File) => {
    setAttachError("");
    if (!ALLOWED_TYPES.includes(file.type)) {
      setAttachError("Obsługiwane formaty: PNG, JPG, GIF, WEBP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setAttachError("Max 4MB. Zrób screenshot fragmentu.");
      return;
    }
    const url = await readFileAsDataUrl(file);
    setAttachments((prev) => [
      ...prev,
      { type: "file", mediaType: file.type, url, filename: file.name },
    ]);
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void addImageFile(file);
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    for (const file of Array.from(e.dataTransfer.files)) {
      if (file.type.startsWith("image/")) void addImageFile(file);
    }
  };

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    for (const file of Array.from(e.target.files ?? [])) void addImageFile(file);
    e.target.value = "";
  };

  const removeAttachment = (index: number) =>
    setAttachments((prev) => prev.filter((_, i) => i !== index));

  // Przy personalizacji dokładamy userId do body żądania — serwer pobierze profil.
  const sendOptions = () =>
    personalize && userIdRef.current
      ? { body: { userId: userIdRef.current } }
      : undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if ((!text && attachments.length === 0) || isBusy) return;
    sendMessage({ text, files: attachments }, sendOptions());
    setInput("");
    setAttachments([]);
  };

  const askExample = (text: string) => {
    if (isBusy) return;
    sendMessage({ text, files: attachments }, sendOptions());
    setAttachments([]);
  };

  const fillTerm = (term: string) => {
    if (isBusy) return;
    setInput(term);
  };

  const messageText = (m: (typeof messages)[number]) =>
    m.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");

  const messageCount = messages.length;
  const totalChars = messages.reduce((sum, m) => sum + messageText(m).length, 0);
  const approxTokens = Math.ceil(totalChars / 4);

  const handleNewChat = () => {
    setMessages([]);
    setAttachments([]);
    if (persist) {
      // Zaczynamy świeżą rozmowę — nowy rekord powstanie przy 1. wiadomości.
      conversationIdRef.current = null;
      setConversationId(null);
      savedIdsRef.current = new Set();
    }
  };

  const handleExport = async () => {
    const transcript = messages
      .map((m) => `${m.role === "user" ? "User" : "Agent"}: ${messageText(m)}`)
      .join("\n");
    const confirmCopied = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    };
    try {
      await navigator.clipboard.writeText(transcript);
      confirmCopied();
      return;
    } catch {
      /* fallback */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = transcript;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) {
        confirmCopied();
        return;
      }
    } catch {
      /* fallback */
    }
    window.prompt("Skopiuj rozmowę ręcznie (Ctrl+C):", transcript);
  };

  const canSend = !isBusy && (input.trim().length > 0 || attachments.length > 0);

  // ── Dane do panelu diagnostyki (z ostatniej wiadomości asystenta) ──────────
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const stats = lastAssistant
    ? toolStats(lastAssistant.parts)
    : { counts: {}, errors: [], totalCalls: 0 };
  const diagThoughts = lastAssistant
    ? (messageText(lastAssistant).match(/🧠/g) || []).length
    : 0;
  const diagStep = Math.min(5, Math.max(diagThoughts, stats.totalCalls > 0 ? 1 : 0));
  const stepColor = diagStep >= 5 ? "#e05a5a" : diagStep >= 4 ? "#d6b23a" : "#4caf6a";
  const diagStatus = isBusy
    ? "⏳ W trakcie..."
    : diagStep >= 5
      ? "⚠️ Limit kroków"
      : lastAssistant
        ? "✅ Ukończone"
        : "—";

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        maxWidth: 800,
        margin: "0 auto",
      }}
    >
      {dragging && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            background: "rgba(20,16,40,0.92)",
            border: "2px dashed #6a4fd5",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            color: "#cfcfe0",
            pointerEvents: "none",
          }}
        >
          🖱️ Upuść obraz
        </div>
      )}

      <header style={{ padding: "20px 16px", borderBottom: "1px solid #333" }}>
        <div style={{ fontSize: 22, fontWeight: 600 }}>{headerTitle}</div>
        <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>{headerSubtitle}</div>
      </header>

      {toolPanel.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            padding: "10px 16px",
            borderBottom: "1px solid #333",
            background: "#0f0f12",
          }}
        >
          {toolPanel.map((t) => (
            <span
              key={t.label}
              style={{
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 999,
                background: "#161620",
                border: "1px solid #2a3a2a",
                color: "#bfe0bf",
              }}
            >
              {t.emoji} {t.label} ✅
            </span>
          ))}
        </div>
      )}

      <section style={{ borderBottom: "1px solid #333", background: "#0f0f12", fontSize: 13 }}>
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 16px",
            background: "transparent",
            border: "none",
            color: "#bbb",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <span>🧠 Kontekst rozmowy</span>
          <span style={{ color: "#666" }}>{panelOpen ? "▲" : "▼"}</span>
        </button>

        {panelOpen && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              padding: "0 16px 12px",
            }}
          >
            <span style={{ color: "#888" }}>
              Wiadomości: <strong style={{ color: "#ededed" }}>{messageCount}</strong> | ~Tokeny:{" "}
              <strong style={{ color: "#ededed" }}>{approxTokens}</strong>
            </span>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={handleExport}
              disabled={messageCount === 0}
              style={{
                padding: "5px 12px",
                borderRadius: 8,
                border: "1px solid #333",
                background: "transparent",
                color: messageCount === 0 ? "#555" : "#ccc",
                fontSize: 13,
                cursor: messageCount === 0 ? "not-allowed" : "pointer",
              }}
            >
              {copied ? "✅ Skopiowano!" : "📋 Eksportuj rozmowę"}
            </button>
            <button
              type="button"
              onClick={handleNewChat}
              disabled={messageCount === 0}
              style={{
                padding: "5px 12px",
                borderRadius: 8,
                border: "1px solid #333",
                background: "transparent",
                color: messageCount === 0 ? "#555" : "#e08a8a",
                fontSize: 13,
                cursor: messageCount === 0 ? "not-allowed" : "pointer",
              }}
            >
              🗑 Nowa rozmowa
            </button>
          </div>
        )}
      </section>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {persist && loadingHistory && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              marginTop: 40,
              color: "#9a9ac0",
              fontSize: 14,
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: "2px solid #3a3a5a",
                borderTopColor: "#6a4fd5",
                display: "inline-block",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <span>Wczytuję poprzednią rozmowę…</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {!loadingHistory && messages.length === 0 && (
          <div style={{ marginTop: 32, textAlign: "center" }}>
            {visionMode && (
              <div
                style={{
                  maxWidth: 420,
                  margin: "0 auto 20px",
                  padding: "24px 16px",
                  borderRadius: 12,
                  border: "1px dashed #444",
                  background: "#12121a",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  color: "#cfcfe0",
                  fontSize: 14,
                }}
              >
                <div>📸 Ctrl+V — wklej screenshot</div>
                <div>📁 Kliknij 📎 — wybierz plik</div>
                <div>🖱️ Przeciągnij — upuść obraz</div>
              </div>
            )}
            <p style={{ color: "#888", marginBottom: 16 }}>
              Od czego zaczniemy? {examples.length > 0 && "Kliknij przykład albo "}
              napisz własne pytanie.
            </p>
            {examples.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  maxWidth: 560,
                  margin: "0 auto",
                }}
              >
                {examples.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => askExample(q)}
                    disabled={isBusy}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #333",
                      background: "#161620",
                      color: "#cfcfe0",
                      fontSize: 14,
                      textAlign: "left",
                      cursor: isBusy ? "not-allowed" : "pointer",
                    }}
                  >
                    💬 {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((message) => {
          const isUser = message.role === "user";
          const images = message.parts.filter(isImageFilePart);
          const sources = message.parts.filter(isSourceUrlPart);
          const toolCount = message.parts.filter(
            (p) => isToolPart(p) && (p as ToolPartLike).state === "output-available",
          ).length;

          // Pasek postępu ReAct — liczymy sekcje 🧠 Myślę jako kroki (max 5)
          const thoughtCount = reactMode
            ? (messageText(message).match(/🧠/g) || []).length
            : 0;
          const step = Math.min(5, Math.max(thoughtCount, toolCount > 0 ? 1 : 0));

          return (
            <div
              key={message.id}
              style={{
                alignSelf: isUser ? "flex-end" : "flex-start",
                maxWidth: isUser ? "75%" : "92%",
                padding: "10px 14px",
                borderRadius: 12,
                background: isUser ? "#2a2a3a" : "#1a1a2a",
                border: isUser ? "none" : "1px solid #333",
              }}
            >
              {/* Obrazy dołączone przez użytkownika */}
              {images.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {images.map((img, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={img.url}
                      alt={img.filename || "obraz"}
                      style={{
                        maxWidth: "100%",
                        maxHeight: 240,
                        borderRadius: 8,
                        border: "1px solid #333",
                      }}
                    />
                  ))}
                </div>
              )}

              {isUser ? (
                messageText(message) && (
                  <span style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    {messageText(message)}
                  </span>
                )
              ) : (
                <>
                  {/* Pasek postępu ReAct */}
                  {reactMode && step > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 12, color: "#9a9ac0", marginBottom: 4 }}>
                        Krok {step} z 5
                      </div>
                      <div
                        style={{
                          height: 6,
                          borderRadius: 999,
                          background: "#2a2a3a",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${(step / 5) * 100}%`,
                            height: "100%",
                            background: "#6a4fd5",
                            transition: "width 0.3s",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Timeline narzędzi + tekst, w kolejności występowania */}
                  {message.parts.map((part, i) => {
                    if (part.type === "text") {
                      return (
                        <AssistantText key={i} text={part.text} reactMode={reactMode} />
                      );
                    }
                    if (isToolPart(part)) {
                      return <ToolCallView key={i} part={part as unknown as ToolPartLike} />;
                    }
                    return null;
                  })}

                  {toolCount > 0 && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#888" }}>
                      🔧 Użyto {toolCount}{" "}
                      {toolCount === 1 ? "narzędzia" : "narzędzi"}
                    </div>
                  )}

                  {sources.length > 0 && (
                    <div
                      style={{
                        marginTop: 10,
                        paddingTop: 8,
                        borderTop: "1px solid #333",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <span style={{ fontSize: 12, color: "#888" }}>🔗 Źródła:</span>
                      {sources.map((source) => (
                        <a
                          key={source.sourceId}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontSize: 13,
                            color: "#6ab0ff",
                            textDecoration: "none",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {source.title || source.url}
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {status === "submitted" && (
          <div
            style={{
              alignSelf: "flex-start",
              padding: "10px 14px",
              borderRadius: 12,
              background: "#1a1a2a",
              border: "1px solid #333",
              color: "#aaa",
              fontStyle: "italic",
            }}
          >
            Myślę...
          </div>
        )}

        {error && (
          <div
            style={{
              alignSelf: "flex-start",
              maxWidth: "92%",
              padding: "10px 14px",
              borderRadius: 12,
              background: "#2a1618",
              border: "1px solid #7a3b3b",
              color: "#e8b4b4",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <span>⚠️ {error.message || "Coś poszło nie tak. Spróbuj ponownie."}</span>
            <button
              type="button"
              onClick={clearError}
              style={{
                alignSelf: "flex-start",
                padding: "4px 12px",
                borderRadius: 8,
                border: "1px solid #7a3b3b",
                background: "transparent",
                color: "#e8b4b4",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Zamknij i spróbuj ponownie
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {diagnostics && (lastAssistant || isBusy) && (
        <div
          style={{
            borderTop: "1px solid #333",
            background: "#0f0f12",
            padding: "10px 16px",
            fontSize: 12,
            color: "#aaa",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ color: "#cfcfe0", fontWeight: 600 }}>🛡️ Diagnostyka</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ minWidth: 54 }}>Kroki:</span>
            <div
              style={{
                flex: 1,
                maxWidth: 160,
                height: 6,
                borderRadius: 999,
                background: "#2a2a3a",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${(diagStep / 5) * 100}%`,
                  height: "100%",
                  background: stepColor,
                  transition: "width 0.3s",
                }}
              />
            </div>
            <span>{diagStep}/5</span>
          </div>
          <div>
            Narzędzia:{" "}
            {stats.totalCalls === 0
              ? "—"
              : Object.entries(stats.counts)
                  .map(([n, c]) => `${n}(${c})`)
                  .join(", ")}
          </div>
          <div>
            Błędy:{" "}
            <span style={{ color: stats.errors.length > 0 ? "#e8b4b4" : "#8fce8f" }}>
              {stats.errors.length}
            </span>
            {elapsedMs != null && (
              <span style={{ marginLeft: 12 }}>Czas: {(elapsedMs / 1000).toFixed(1)}s</span>
            )}
          </div>
          <div>Status: {diagStatus}</div>
          {stats.errors.map((e, i) => (
            <div key={i} style={{ color: "#e8b4b4" }}>
              🔴 {e.name} — {e.message}
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: "1px solid #333", padding: "12px 16px 0" }}>
        {attachments.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {attachments.map((att, i) => (
              <div key={i} style={{ position: "relative" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={att.url}
                  alt={att.filename || "załącznik"}
                  style={{
                    maxHeight: 120,
                    borderRadius: 8,
                    border: "1px solid #444",
                    display: "block",
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  aria-label="Usuń obraz"
                  style={{
                    position: "absolute",
                    top: -8,
                    right: -8,
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    border: "none",
                    background: "#7a3b3b",
                    color: "#fff",
                    fontSize: 12,
                    cursor: "pointer",
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            <span style={{ alignSelf: "center", fontSize: 12, color: "#888" }}>
              📎 Zadaj pytanie o {attachments.length > 1 ? "te obrazy" : "ten obraz"}
            </span>
          </div>
        )}

        {attachError && (
          <div style={{ color: "#e8b4b4", fontSize: 13, marginBottom: 8 }}>⚠️ {attachError}</div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            onChange={onFilePick}
            style={{ display: "none" }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
            aria-label="Dodaj obraz"
            title="Dodaj obraz"
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #333",
              background: "transparent",
              color: "#ccc",
              fontSize: 16,
              cursor: isBusy ? "not-allowed" : "pointer",
            }}
          >
            📎
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={inputPlaceholder}
            disabled={isBusy}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #333",
              background: "#141414",
              color: "#ededed",
              fontSize: 15,
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={!canSend}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: !canSend ? "#333" : "#2a2a3a",
              color: "#ededed",
              fontSize: 15,
              cursor: !canSend ? "not-allowed" : "pointer",
            }}
          >
            Wyślij
          </button>
        </form>

        {termChips.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "10px 0 14px" }}>
            {termChips.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => fillTerm(term)}
                disabled={isBusy}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: "1px solid #333",
                  background: "#161620",
                  color: "#cfcfe0",
                  fontSize: 13,
                  cursor: isBusy ? "not-allowed" : "pointer",
                }}
              >
                {term}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
