"use client";

import { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Wykresy do dashboardu użycia (L11/W2) — czyste SVG, zero zewnętrznych bibliotek.
//
// Zasady, których się trzymamy:
//   • każdy wykres ma JEDNĄ serię → brak legendy, brak palety kategorycznej;
//   • marki w istniejącym tokenie marki (--brand-fg), siatka w --border,
//     opisy w --muted — żadnych nowych kolorów;
//   • cienkie marki, ciągłe linie włosowe siatki, zaokrąglony tylko koniec
//     słupka (podstawa trzyma się osi), odstęp między słupkami;
//   • etykiety bezpośrednie wybiórczo (maksimum), reszta w tooltipie i tabeli.
// ─────────────────────────────────────────────────────────────────────────────

export type Point = { key: string; label: string; value: number };

/**
 * Górna granica skali: „ładna" wartość z niewielkim zapasem nad maksimum.
 * Krok = 20% rzędu wielkości, więc oś nie zostawia połowy karty pustej
 * (dla 11 daje 12, nie 20) i wciąż wypada na okrągłych liczbach.
 */
export function niceMax(v: number): number {
  if (v <= 0) return 10;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const step = mag / 5;
  return Math.max(step, Math.ceil((v * 1.08) / step) * step);
}

export const fmtInt = (n: number) => n.toLocaleString("pl-PL");
const shortLabel = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));

function Tooltip({ leftPct, value, unit, label }: { leftPct: number; value: number; unit: string; label: string }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: `${leftPct}%`,
        transform: "translateX(-50%)",
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "6px 10px",
        fontSize: 12,
        pointerEvents: "none",
        whiteSpace: "nowrap",
        boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
        zIndex: 1,
      }}
    >
      <strong>{fmtInt(value)}</strong> {unit}
      <div style={{ color: "var(--muted)" }}>{label}</div>
    </div>
  );
}

// ── Wykres liniowy (jedna seria) ─────────────────────────────────────────────
export function LineChart({ data, unit }: { data: Point[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 210;
  const padL = 48, padR = 16, padT = 16, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  if (data.length === 0) return null;

  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;
  const x = (i: number) => padL + i * stepX;
  const y = (v: number) => padT + plotH - (v / max) * plotH;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.value)}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${padT + plotH} L${padL},${padT + plotH} Z`;
  const maxIdx = data.reduce((b, d, i) => (d.value > data[b].value ? i : b), 0);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
        {/* Siatka — ciągłe linie włosowe, jeden odcień od tła */}
        {ticks.map((t) => {
          const yy = padT + plotH - t * plotH;
          return (
            <g key={t}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="var(--border)" strokeWidth={1} />
              <text
                x={padL - 8}
                y={yy + 4}
                textAnchor="end"
                fill="var(--muted)"
                style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
              >
                {shortLabel(Math.round(t * max))}
              </text>
            </g>
          );
        })}

        <path d={area} fill="color-mix(in srgb, var(--brand-fg) 14%, transparent)" />
        <path
          d={line}
          fill="none"
          stroke="var(--brand-fg)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {data.map((d, i) => (
          <circle
            key={d.key}
            cx={x(i)}
            cy={y(d.value)}
            r={hover === i ? 5.5 : 4}
            fill="var(--brand-fg)"
            stroke="var(--surface)"
            strokeWidth={2}
          />
        ))}

        {/* Etykieta bezpośrednia tylko na maksimum (nie na każdym punkcie) */}
        {data[maxIdx].value > 0 && (
          <text
            x={x(maxIdx)}
            y={y(data[maxIdx].value) - 12}
            textAnchor="middle"
            fill="var(--text)"
            style={{ fontSize: 11, fontWeight: 700 }}
          >
            {fmtInt(data[maxIdx].value)}
          </text>
        )}

        {data.map((d, i) => (
          <text
            key={`x${d.key}`}
            x={x(i)}
            y={H - 8}
            textAnchor="middle"
            fill="var(--muted)"
            style={{ fontSize: 11 }}
          >
            {d.label}
          </text>
        ))}

        {/* Warstwa hover — pola trafienia szersze niż same punkty */}
        {data.map((d, i) => (
          <rect
            key={`h${d.key}`}
            x={x(i) - (stepX || plotW) / 2}
            y={padT}
            width={stepX || plotW}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {hover !== null && (
          <line x1={x(hover)} y1={padT} x2={x(hover)} y2={padT + plotH} stroke="var(--border)" strokeWidth={1} />
        )}
      </svg>

      {hover !== null && (
        <Tooltip
          leftPct={(x(hover) / W) * 100}
          value={data[hover].value}
          unit={unit}
          label={data[hover].label}
        />
      )}
    </div>
  );
}

/** Ścieżka prostokąta z zaokrąglonym TYLKO górnym końcem (podstawa na osi). */
function barTopPath(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

// ── Wykres słupkowy (jedna seria) ────────────────────────────────────────────
export function BarChart({ data, unit }: { data: Point[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 210;
  const padL = 48, padR = 16, padT = 16, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  if (data.length === 0) return null;

  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const band = plotW / data.length;
  // Cienkie marki: nasycona zieleń marki ma być akcentem, nie wielkim blokiem.
  const barW = Math.min(34, Math.max(8, band - 10));
  const ticks = [0, 0.5, 1];

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
        {ticks.map((t) => {
          const yy = padT + plotH - t * plotH;
          return (
            <g key={t}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="var(--border)" strokeWidth={1} />
              <text
                x={padL - 8}
                y={yy + 4}
                textAnchor="end"
                fill="var(--muted)"
                style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
              >
                {shortLabel(Math.round(t * max))}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const h = (d.value / max) * plotH;
          const bx = padL + i * band + (band - barW) / 2;
          const by = padT + plotH - h;
          return (
            <g key={d.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* Powiększone pole trafienia */}
              <rect x={padL + i * band} y={padT} width={band} height={plotH} fill="transparent" />
              {h > 0 && (
                <path
                  d={barTopPath(bx, by, barW, h, 4)}
                  fill="var(--brand-fg)"
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
              )}
              <text
                x={padL + i * band + band / 2}
                y={H - 8}
                textAnchor="middle"
                fill="var(--muted)"
                style={{ fontSize: 11 }}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>

      {hover !== null && (
        <Tooltip
          leftPct={((padL + hover * band + band / 2) / W) * 100}
          value={data[hover].value}
          unit={unit}
          label={data[hover].label}
        />
      )}
    </div>
  );
}

// ── Słupki poziome: udział endpointów (kategorie nominalne → jeden kolor) ─────
export function EndpointBars({
  rows,
  total,
}: {
  rows: { label: string; value: number }[];
  total: number;
}) {
  if (rows.length === 0) {
    return (
      <p className="muted" style={{ fontSize: 14, margin: 0 }}>
        Brak danych o zużyciu.
      </p>
    );
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r) => {
        const pct = total > 0 ? Math.round((r.value / total) * 100) : 0;
        return (
          <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 132,
                flexShrink: 0,
                fontSize: 13,
                color: "var(--text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={r.label}
            >
              {r.label}
            </span>
            <div style={{ flex: 1, minWidth: 40, height: 12, position: "relative" }}>
              <div style={{ position: "absolute", inset: 0, background: "var(--surface-2)", borderRadius: 999 }} />
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${(r.value / max) * 100}%`,
                  background: "var(--brand-fg)",
                  borderRadius: 999,
                }}
              />
            </div>
            <span
              style={{
                width: 116,
                flexShrink: 0,
                textAlign: "right",
                fontSize: 12.5,
                color: "var(--text)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtInt(r.value)} <span style={{ color: "var(--muted)" }}>({pct}%)</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
