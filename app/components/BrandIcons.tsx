// Zestaw ikon w stylu marki VERMI — cienka linia, zaokrąglone, currentColor.
// Ikony z brandu (czat, zadania, kalendarz, powiadomienia, profil, ustawienia,
// szukaj, dokumenty, prześlij, pobierz, ulubione, statystyki, bezpieczeństwo)
// oraz dodatkowe w tym samym stylu dla pozostałych funkcji.

import type { ReactNode } from "react";

type IconName =
  | "dashboard" | "agent" | "react" | "travel" | "chat" | "history"
  | "upload" | "knowledge" | "email" | "report" | "competitor" | "meeting"
  | "briefings" | "webhook" | "think" | "search" | "generate" | "vision"
  | "dictionary" | "format" | "logout" | "sun" | "moon" | "system"
  | "shield" | "alert" | "stats";

const P: Record<IconName, ReactNode> = {
  dashboard: <><path d="M3 12 12 3l9 9" /><path d="M5 10v10h14V10" /></>,
  agent: <><rect x="5" y="7" width="14" height="12" rx="3" /><path d="M12 3v4M9 12h.01M15 12h.01M9 16h6" /></>,
  react: <><path d="M4 12a8 8 0 0 1 14-5" /><path d="M20 12a8 8 0 0 1-14 5" /><path d="M18 3v4h-4M6 21v-4h4" /></>,
  travel: <path d="M10 3 4 14l-2 .5 2.5 3.5L8 21l1-6 6 5 2-2-3-7 3-3a1.6 1.6 0 0 0-2.3-2.3l-3 3-4-2.7Z" />,
  chat: <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 10h.01M12 10h.01M16 10h.01" /></>,
  history: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
  upload: <><path d="M12 15V4M8 8l4-4 4 4" /><path d="M4 15v4h16v-4" /></>,
  knowledge: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4-4M9 11h4M11 9v4" /></>,
  email: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></>,
  report: <><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></>,
  competitor: <><rect x="3" y="8" width="7" height="12" rx="1" /><rect x="14" y="4" width="7" height="16" rx="1" /><path d="M6 12h1M6 15h1M17 8h1M17 11h1" /></>,
  meeting: <><rect x="6" y="4" width="12" height="16" rx="2" /><path d="M9 3h6v3H9zM9 11h6M9 15h4" /></>,
  briefings: <><path d="M4 5h13v14H5a1 1 0 0 1-1-1V5Z" /><path d="M17 8h3v9a2 2 0 0 1-2 2M7 8h7M7 12h7M7 16h4" /></>,
  webhook: <><path d="m13 3-2 7h4l-2 7" /><path d="M6 14a4 4 0 1 0 4 4M18 10a4 4 0 1 0-4-4" /></>,
  think: <><path d="M9 18h6v-1a5 5 0 1 0-6 0v1Z" /><path d="M10 21h4M12 3v1M5 8H4M20 8h-1" /></>,
  search: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.3 2.5 14.7 0 17M12 3.5c-2.5 2.3-2.5 14.7 0 17" /></>,
  generate: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m4 18 5-5 4 4 3-3 4 4" /></>,
  vision: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="2.5" /></>,
  dictionary: <><path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z" /><path d="M18 16H7a2 2 0 0 0-2 2M9 8h6" /></>,
  format: <><path d="M4 5h16M4 5v14M4 12h9M4 19h16" /><path d="M17 9v10M14 12l3-3 3 3" /></>,
  logout: <><path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="M10 12h9M16 9l3 3-3 3M4 12h3" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></>,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5Z" />,
  system: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  shield: <><path d="M12 3 5 6v5c0 4.5 3 7.5 7 10 4-2.5 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>,
  alert: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h.01" /></>,
  stats: <><path d="M4 4v16h16" /><path d="m7 15 4-5 3 3 4-6" /><circle cx="7" cy="15" r="1" /><circle cx="18" cy="7" r="1" /></>,
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {P[name]}
    </svg>
  );
}

export type { IconName };

// Logo marki jest teraz osobnym komponentem na prawdziwych plikach marki:
// zobacz components/VermiLockup.tsx.
