// Lockup marki VERMI — maskotka + wordmark „VERMI / TWÓJ AGENT AI DO ZADAŃ
// SPECJALNYCH". Pliki powstają z app/VERMI przez scripts/build-vermi-assets.mjs.
//
// Trzy warianty:
//   horizontal — pełny znak (z tagline'em); do nagłówków, gdzie jest szerokość,
//   compact    — maskotka + „VERMI" bez tagline'u; do niskich pasków (mobile),
//                bo w 52 px wysokości tagline jest już nieczytelny,
//   vertical   — maskotka nad wordmarkiem; ekran logowania.
//
// Każdy wariant ma plik jasny i ciemny (różni się kolor wordmarku). Oba idą
// do HTML-a, a widoczny wybiera CSS — tak samo jak resztę motywu: preferencja
// systemu + nadpisanie przez [data-theme] na <html>. Dzięki temu przełączenie
// motywu działa natychmiast i bez migotania po hydracji.

type Variant = "horizontal" | "compact" | "vertical";

const FILES: Record<Variant, { light: string; dark: string; ratio: number }> = {
  horizontal: { light: "/vermi/logo-lockup.png", dark: "/vermi/logo-lockup-dark.png", ratio: 608 / 280 },
  compact: { light: "/vermi/logo-compact.png", dark: "/vermi/logo-compact-dark.png", ratio: 553 / 189 },
  vertical: { light: "/vermi/logo-vertical.png", dark: "/vermi/logo-vertical-dark.png", ratio: 520 / 613 },
};

const ALT = "VERMI — Twój agent AI do zadań specjalnych";

export function VermiLockup({
  variant = "horizontal",
  width,
  height,
}: {
  variant?: Variant;
  /** Podaj szerokość ALBO wysokość — drugi wymiar wyliczy się z proporcji. */
  width?: number;
  height?: number;
}) {
  const file = FILES[variant];
  const w = width ?? (height ? Math.round(height * file.ratio) : 160);
  const h = height ?? Math.round(w / file.ratio);

  return (
    <span className="vermi-lockup" role="img" aria-label={ALT} style={{ width: w, height: h }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="vermi-theme-light" src={file.light} alt="" aria-hidden="true" width={w} height={h} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="vermi-theme-dark" src={file.dark} alt="" aria-hidden="true" width={w} height={h} />
    </span>
  );
}
