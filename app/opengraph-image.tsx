import { ImageResponse } from "next/og";

// ─────────────────────────────────────────────────────────────────────────────
// og:image (Lekcja 11, Warsztat 4) — podgląd linku na LinkedIn / Slack / X.
//
// Generowany w locie przez next/og (zero nowych zależności, zero plików binarnych).
// Kolory: dokładnie te z motywu aplikacji (#0f172a tło, #7cfc00 akcent marki).
// Next automatycznie dopisuje ten obraz do metadanych openGraph i twitter.
// ─────────────────────────────────────────────────────────────────────────────

export const alt = "VERMI — PM ASSISTANT: agent AI z pamięcią i bazą wiedzy";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0f172a";
const ACCENT = "#7cfc00";
const TEXT = "#e2e8f0";
const MUTED = "#94a3b8";
const SURFACE = "#1e293b";
const BORDER = "#334155";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          // Miękka poświata marki w prawym górnym rogu (bez twardej krawędzi).
          backgroundColor: BG,
          backgroundImage:
            "radial-gradient(circle at 96% -10%, rgba(124,252,0,0.30), rgba(124,252,0,0.10) 34%, rgba(15,23,42,0) 62%)",
          padding: "68px 72px",
          position: "relative",
        }}
      >

        {/* Górny pasek: znak marki */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 74,
              height: 74,
              borderRadius: 20,
              background: ACCENT,
              fontSize: 42,
            }}
          >
            🤖
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 46, color: ACCENT, letterSpacing: 2, lineHeight: 1.1 }}>
              VERMI
            </div>
            <div style={{ fontSize: 20, color: MUTED, letterSpacing: 5 }}>PM ASSISTANT</div>
          </div>
        </div>

        {/* Główny komunikat */}
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 940 }}>
          <div style={{ fontSize: 62, color: TEXT, lineHeight: 1.15 }}>
            Twój asystent PM, który zna Twoje projekty
          </div>
          <div style={{ fontSize: 27, color: MUTED, marginTop: 22, lineHeight: 1.4 }}>
            Pamięta rozmowy · odpowiada z dokumentów firmy · pracuje 24/7
          </div>
        </div>

        {/* Dolny pasek: cechy + domena */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 14 }}>
            {["Pamięć", "Baza wiedzy (RAG)", "Automatyzacja"].map((chip) => (
              <div
                key={chip}
                style={{
                  display: "flex",
                  fontSize: 22,
                  color: TEXT,
                  background: SURFACE,
                  border: `2px solid ${BORDER}`,
                  borderRadius: 9999,
                  padding: "10px 24px",
                }}
              >
                {chip}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 26, color: ACCENT }}>verme.eu</div>
        </div>
      </div>
    ),
    size,
  );
}
