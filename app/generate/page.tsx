"use client";

import { useState } from "react";

const EXAMPLES = [
  "Minimalistyczne logo kawiarni w stylu japońskim",
  "Post na Instagram: kawa latte art, ciepłe światło, widok z góry",
  "Kreacja reklamowa: wyprzedaż letnia -50%, nowoczesny design",
  "Ikona aplikacji: robot AI, gradient fioletowo-niebieski, flat design",
  "Infografika: 5 kroków do produktywności, pastelowe kolory",
  "Zdjęcie produktowe: elegancki zegarek na ciemnym tle",
];

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState("");
  const [lastPrompt, setLastPrompt] = useState("");

  const generate = async (text: string) => {
    const p = text.trim();
    if (!p || loading) return;
    setLoading(true);
    setError("");
    setImage(null);
    setCaption("");
    setLastPrompt(p);

    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Nie udało się wygenerować obrazu.");
      } else {
        setImage(data.image);
        setCaption(data.text || "");
      }
    } catch {
      setError("Błąd połączenia z serwerem. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    if (!image) return;
    const a = document.createElement("a");
    a.href = image;
    a.download = "ai-generated.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      style={{
        maxWidth: 800,
        margin: "0 auto",
        padding: "20px 16px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div>
        <div style={{ fontSize: 22, fontWeight: 600 }}>🎨 Generator grafik AI</div>
        <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
          Opisz co chcesz — AI stworzy obraz w kilka sekund
        </div>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Opisz obraz który chcesz wygenerować..."
        rows={3}
        disabled={loading}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: 10,
          border: "1px solid #333",
          background: "#141414",
          color: "#ededed",
          fontSize: 15,
          fontFamily: "inherit",
          resize: "vertical",
          outline: "none",
        }}
      />

      <button
        type="button"
        onClick={() => generate(prompt)}
        disabled={loading || !prompt.trim()}
        style={{
          alignSelf: "flex-start",
          padding: "10px 24px",
          borderRadius: 8,
          border: "none",
          background: loading || !prompt.trim() ? "#333" : "#6a4fd5",
          color: "#ededed",
          fontSize: 15,
          fontWeight: 600,
          cursor: loading || !prompt.trim() ? "not-allowed" : "pointer",
        }}
      >
        🎨 Generuj
      </button>

      {/* Przykładowe prompty */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setPrompt(ex)}
            disabled={loading}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid #333",
              background: "#161620",
              color: "#cfcfe0",
              fontSize: 12,
              cursor: loading ? "not-allowed" : "pointer",
              textAlign: "left",
            }}
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Stan ładowania */}
      {loading && (
        <div
          style={{
            marginTop: 8,
            height: 320,
            borderRadius: 12,
            border: "1px solid #333",
            background: "#161620",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#aaa",
            animation: "vermiPulse 1.4s ease-in-out infinite",
          }}
        >
          Generuję... (5–15 sekund)
        </div>
      )}

      {/* Błąd */}
      {error && !loading && (
        <div
          style={{
            marginTop: 8,
            padding: "12px 14px",
            borderRadius: 12,
            background: "#2a1618",
            border: "1px solid #7a3b3b",
            color: "#e8b4b4",
            fontSize: 14,
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Wynik */}
      {image && !loading && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt="Wygenerowany obraz"
            style={{
              maxWidth: "100%",
              borderRadius: 12,
              border: "1px solid #333",
            }}
          />
          {caption && (
            <p style={{ color: "#bbb", fontSize: 14, lineHeight: 1.5, margin: 0 }}>
              {caption}
            </p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={download}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid #333",
                background: "#2a2a3a",
                color: "#ededed",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              💾 Pobierz
            </button>
            <button
              type="button"
              onClick={() => generate(lastPrompt)}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid #333",
                background: "transparent",
                color: "#ccc",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              🔄 Ponownie
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes vermiPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
