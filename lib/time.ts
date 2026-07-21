// Pomocnicze formatowanie czasu dla historii rozmów (po polsku).

const MONTHS_PL = [
  "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
];

/**
 * Data względna: "przed chwilą", "5 min temu", "3 godz. temu", "wczoraj",
 * a dla starszych — pełna data "15 czerwca 2026".
 */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60_000);
  const hour = Math.floor(diffMs / 3_600_000);
  const day = Math.floor(diffMs / 86_400_000);

  if (min < 1) return "przed chwilą";
  if (min < 60) return `${min} min temu`;
  if (hour < 24) return `${hour} godz. temu`;
  if (day === 1) return "wczoraj";
  if (day < 7) return `${day} dni temu`;

  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_PL[d.getMonth()]} ${d.getFullYear()}`;
}

/** Godzina w formacie 24h "14:32" (strefa lokalna przeglądarki). */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

/** Pełna data i godzina "15 czerwca 2026, 14:32" — do nagłówka podglądu. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS_PL[d.getMonth()]} ${d.getFullYear()}, ${formatTime(iso)}`;
}
