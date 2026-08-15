// ─────────────────────────────────────────────────────────────────────────────
// Lista administratorów (Lekcja 10, Warsztat 4).
// Dostęp do panelu /admin/security mają wyłącznie te konta.
//
// Uwaga: to lista po stronie klienta (wygodna dla panelu). Realne dane i tak
// są chronione logowaniem Supabase; panel tylko je pokazuje. W razie potrzeby
// można przenieść listę do zmiennej środowiskowej NEXT_PUBLIC_ADMIN_EMAILS.
// ─────────────────────────────────────────────────────────────────────────────

export const ADMIN_EMAILS = [
  "p.robak@dartom.com.pl",
  "probak.dartom@gmail.com",
];

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
