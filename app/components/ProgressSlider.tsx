"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Suwak postępu zadania (PM TO DO) — skala 0–100% z przejściem kolorów:
// czerwony (0%) → żółty (50%) → zielony (100%).
//
// Procent jest zawsze pokazany także LICZBĄ obok suwaka — kolor nie jest
// jedynym nośnikiem informacji (istotne przy zaburzeniach widzenia barw).
// ─────────────────────────────────────────────────────────────────────────────

const RED = [239, 68, 68];
const YELLOW = [234, 179, 8];
const GREEN = [34, 197, 94];

function mix(a: number[], b: number[], t: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** Kolor odpowiadający procentowi wykonania. */
export function progressColor(p: number): string {
  const x = Math.max(0, Math.min(100, p));
  return x <= 50 ? mix(RED, YELLOW, x / 50) : mix(YELLOW, GREEN, (x - 50) / 50);
}

/** Style suwaka — wstaw RAZ na stronie (nie modyfikuje globals.css). */
export function ProgressSliderStyles() {
  return (
    <style>{`
      .pm-slider {
        -webkit-appearance: none;
        appearance: none;
        height: 8px;
        border-radius: 999px;
        outline: none;
        cursor: pointer;
      }
      .pm-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--bg);
        border: 3px solid var(--pm-color);
        cursor: pointer;
        box-shadow: 0 1px 3px rgba(0,0,0,0.25);
      }
      .pm-slider::-moz-range-thumb {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--bg);
        border: 3px solid var(--pm-color);
        cursor: pointer;
      }
      .pm-slider:focus-visible {
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 45%, transparent);
      }
    `}</style>
  );
}

export function ProgressSlider({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  /** Opis do czytnika ekranu, np. tytuł zadania. */
  label: string;
}) {
  const color = progressColor(value);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="pm-slider"
        aria-label={`Postęp: ${label} — ${value}%`}
        style={
          {
            flex: 1,
            "--pm-color": color,
            background: `linear-gradient(90deg, ${color} 0%, ${color} ${value}%, var(--surface-2) ${value}%, var(--surface-2) 100%)`,
          } as React.CSSProperties
        }
      />
      <span
        style={{
          minWidth: 46,
          textAlign: "right",
          fontSize: 13.5,
          fontWeight: 700,
          color,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}%
      </span>
    </div>
  );
}
