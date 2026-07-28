"use client";

// Maskotka VERMI — pływający asystent w prawym dolnym rogu, na każdej stronie.
// Montowana raz, w app/layout.tsx.
//
// „Życie" maskotki:
//   • ciągła animacja unoszenia + cień oddychający w rytm ruchu (CSS),
//   • mina dobrana do aktualnej podstrony (np. lupa na raportach, żarówka
//     przy myśleniu, dzwonek przy triage'u e-maili),
//   • co kilka sekund krótka „zmiana miny" z puli pasującej do strony,
//   • dymek z podpowiedzią kontekstową — sam pokazuje się po wejściu na
//     stronę, potem na hover/klik; można go przełączać na kolejne wskazówki,
//   • przycisk zwinięcia (maskotka zostaje widoczna jako mały krążek).
//
// Ruch respektuje prefers-reduced-motion (reguły w globals.css).

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Mood =
  | "witaj" | "praca" | "pomysl" | "analiza" | "pytanie"
  | "powiadomienie" | "sukces" | "szybkosc" | "symbol";

const SRC: Record<Mood, string> = {
  witaj: "/vermi/mascot/witaj.png",
  praca: "/vermi/mascot/praca.png",
  pomysl: "/vermi/mascot/pomysl.png",
  analiza: "/vermi/mascot/analiza.png",
  pytanie: "/vermi/mascot/pytanie.png",
  powiadomienie: "/vermi/mascot/powiadomienie.png",
  sukces: "/vermi/mascot/sukces.png",
  szybkosc: "/vermi/mascot/szybkosc.png",
  symbol: "/vermi/mascot/symbol.png",
};

type PageProfile = { mood: Mood; idle: Mood[]; tips: string[] };

// Klucz to początek ścieżki; "/" dopasowuje się tylko dokładnie.
const PAGES: Record<string, PageProfile> = {
  "/": {
    mood: "witaj",
    idle: ["sukces", "pomysl"],
    tips: [
      "Cześć! Jestem VERMI. Kafelki niżej to skrót do wszystkiego, co umiem.",
      "Zacznij od Agenta albo Chatu — resztę podpowiem w drodze.",
    ],
  },
  // /dashboard renderuje ten sam Dashboard co "/" — ten sam profil.
  "/dashboard": {
    mood: "witaj",
    idle: ["sukces", "pomysl"],
    tips: [
      "Cześć! Jestem VERMI. Kafelki niżej to skrót do wszystkiego, co umiem.",
      "Zacznij od Agenta albo Chatu — resztę podpowiem w drodze.",
    ],
  },
  "/login": {
    mood: "witaj",
    idle: ["sukces"],
    tips: [
      "Zaloguj się, a od razu wracam z Twoimi danymi.",
      "Nie masz konta? Rejestracja to e-mail i hasło — nic więcej.",
    ],
  },
  "/agent": {
    mood: "praca",
    idle: ["pomysl", "szybkosc"],
    tips: [
      "Napisz zadanie w jednym zdaniu — sam dobiorę narzędzia.",
      "Im konkretniej opiszesz cel, tym mniej kroków zmarnuję.",
    ],
  },
  "/react": {
    mood: "analiza",
    idle: ["pomysl", "praca"],
    tips: [
      "Tu widzisz mój tok myślenia krok po kroku: myśl → akcja → obserwacja.",
      "Jeśli utknę w pętli, dopisz w zadaniu, czego mam NIE robić.",
    ],
  },
  "/travel": {
    mood: "szybkosc",
    idle: ["pomysl", "sukces"],
    tips: [
      "Podaj miasta i daty — resztę planu ułożę sam.",
      "Dopisz budżet, a dobiorę warianty pod niego.",
    ],
  },
  "/chat": {
    mood: "pytanie",
    idle: ["praca", "pomysl"],
    tips: [
      "Możesz wrzucić obraz spinaczem — opiszę, co na nim widzę.",
      "Pytaj dalej w tym samym wątku, pamiętam kontekst rozmowy.",
    ],
  },
  "/history": {
    mood: "praca",
    idle: ["analiza"],
    tips: [
      "Wszystkie rozmowy są tutaj — kliknij, żeby wrócić do wątku.",
      "Szukasz czegoś starszego? Zajrzyj do Wiedzy, tam szukam po treści.",
    ],
  },
  "/upload": {
    mood: "praca",
    idle: ["sukces", "analiza"],
    tips: [
      "Wrzuć dokument, pocięcie na fragmenty i embeddingi robię sam.",
      "Po wgraniu przetestuj pytanie w zakładce Wiedza.",
    ],
  },
  "/knowledge": {
    mood: "analiza",
    idle: ["pytanie", "pomysl"],
    tips: [
      "Szukam po znaczeniu, nie po słowach — pytaj pełnym zdaniem.",
      "Brak trafień? Sprawdź, czy dokument jest już w Bazie wiedzy.",
    ],
  },
  "/email-triage": {
    mood: "powiadomienie",
    idle: ["analiza", "szybkosc"],
    tips: [
      "Wklej treść maila — rozłożę go na pilność, temat i propozycję odpowiedzi.",
      "Nic nie wysyłam bez Twojej zgody. Zawsze pokazuję projekt odpowiedzi.",
    ],
  },
  "/report": {
    mood: "analiza",
    idle: ["praca", "sukces"],
    tips: [
      "Powiedz, dla kogo jest raport — inaczej piszę do zarządu, inaczej do zespołu.",
      "Mogę oprzeć raport na Twojej bazie wiedzy, wystarczy o to poprosić.",
    ],
  },
  "/competitor": {
    mood: "analiza",
    idle: ["pomysl", "pytanie"],
    tips: [
      "Podaj nazwy firm — zestawię je w tabelę porównawczą.",
      "Dopisz, co Cię interesuje: ceny, oferta, komunikacja?",
    ],
  },
  "/meeting-summary": {
    mood: "praca",
    idle: ["sukces", "analiza"],
    tips: [
      "Wklej notatki lub transkrypcję — wyciągnę decyzje i zadania.",
      "Poproszę o listę uczestników, wtedy przypiszę zadania do osób.",
    ],
  },
  "/briefings": {
    mood: "powiadomienie",
    idle: ["praca", "sukces"],
    tips: [
      "Briefing potrafi przychodzić rano automatycznie.",
      "Kliknij „generuj”, żeby zobaczyć, jak wygląda dzisiejsza wersja.",
    ],
  },
  "/webhook-events": {
    mood: "powiadomienie",
    idle: ["analiza", "szybkosc"],
    tips: [
      "Tu ląduje wszystko, co przyszło z zewnątrz przez webhooka.",
      "Zdarzenia bez reakcji to zwykle znak, że filtr jest za wąski.",
    ],
  },
  "/think": {
    mood: "pomysl",
    idle: ["analiza", "pytanie"],
    tips: [
      "Tu myślę dłużej i na głos — dobre do trudnych decyzji.",
      "Daj kryteria wyboru, a porównam opcje po nich.",
    ],
  },
  "/search": {
    mood: "analiza",
    idle: ["szybkosc", "pytanie"],
    tips: [
      "Szukam w sieci i podaję źródła — możesz je klikać.",
      "Doprecyzuj okres („z ostatniego miesiąca”), jeśli liczy się świeżość.",
    ],
  },
  "/generate": {
    mood: "pomysl",
    idle: ["sukces", "praca"],
    tips: [
      "Opisz obraz jak scenę: co, gdzie, w jakim stylu, jakie światło.",
      "Nie podoba się? Zmień jeden element opisu, nie cały prompt.",
    ],
  },
  "/vision": {
    mood: "analiza",
    idle: ["pytanie", "sukces"],
    tips: [
      "Wgraj zdjęcie i zapytaj konkretnie — np. „co jest na tej fakturze?”.",
      "Umiem też czytać tekst ze zrzutów ekranu.",
    ],
  },
  "/fewshot": {
    mood: "pomysl",
    idle: ["praca"],
    tips: [
      "Kilka dobrych przykładów uczy mnie Twojego stylu lepiej niż długa instrukcja.",
      "Dodaj też przykład błędny — pokaże mi granicę.",
    ],
  },
  "/format": {
    mood: "praca",
    idle: ["sukces", "szybkosc"],
    tips: [
      "Wklej surowy tekst — oddam go w równym formacie.",
      "Powiedz, jaki format ma być na wyjściu: tabela, lista, JSON?",
    ],
  },
};

const FALLBACK: PageProfile = {
  mood: "witaj",
  idle: ["praca", "pomysl", "sukces"],
  tips: ["Jestem tu, jeśli będę potrzebny. Kliknij mnie po podpowiedź."],
};

function profileFor(pathname: string): PageProfile {
  if (PAGES[pathname]) return PAGES[pathname];
  // Najdłuższy pasujący prefiks (np. /history/123 → /history)
  let best: PageProfile | null = null;
  let bestLen = 0;
  for (const [key, profile] of Object.entries(PAGES)) {
    if (key === "/") continue;
    if (pathname.startsWith(key + "/") && key.length > bestLen) {
      best = profile;
      bestLen = key.length;
    }
  }
  return best ?? FALLBACK;
}

const DOCK_KEY = "vermi-mascot-docked";

export function VermiMascot() {
  const pathname = usePathname() ?? "/";
  const profile = useMemo(() => profileFor(pathname), [pathname]);

  const [docked, setDocked] = useState(false);
  const [mood, setMood] = useState<Mood>(profile.mood);
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [pinned, setPinned] = useState(false); // dymek otwarty klikiem
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Zapamiętany stan zwinięcia
  useEffect(() => {
    try {
      setDocked(localStorage.getItem(DOCK_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const setDockedPersisted = useCallback((value: boolean) => {
    setDocked(value);
    setPinned(false);
    setBubbleOpen(false);
    try {
      localStorage.setItem(DOCK_KEY, value ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  // Zmiana strony: nowa mina, pierwsza podpowiedź i krótkie „przywitanie".
  useEffect(() => {
    setMood(profile.mood);
    setTipIndex(0);
    setPinned(false);
    if (docked) return;
    setBubbleOpen(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setBubbleOpen(false), 5200);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [profile, docked]);

  // Co kilka sekund krótka zmiana miny — dzięki temu maskotka „żyje".
  useEffect(() => {
    if (docked || profile.idle.length === 0) return;
    let back: ReturnType<typeof setTimeout> | null = null;
    const tick = setInterval(() => {
      const next = profile.idle[Math.floor(Math.random() * profile.idle.length)];
      setMood(next);
      back = setTimeout(() => setMood(profile.mood), 2600);
    }, 9000);
    return () => {
      clearInterval(tick);
      if (back) clearTimeout(back);
    };
  }, [profile, docked]);

  const tips = profile.tips.length > 0 ? profile.tips : FALLBACK.tips;
  const tip = tips[tipIndex % tips.length];

  const onMascotClick = () => {
    if (pinned) {
      setPinned(false);
      setBubbleOpen(false);
      return;
    }
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setPinned(true);
    setBubbleOpen(true);
    setMood("pytanie");
    setTimeout(() => setMood(profile.mood), 1600);
  };

  if (docked) {
    return (
      <div className="vermi-dock">
        <button
          type="button"
          className="vermi-dock-btn"
          onClick={() => setDockedPersisted(false)}
          title="Pokaż VERMI"
          aria-label="Pokaż maskotkę VERMI"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SRC.witaj} alt="" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="vermi-mascot" data-open={bubbleOpen ? "1" : "0"}>
      <div className="vermi-bubble" role="status" aria-live="polite">
        <p className="vermi-bubble-text">{tip}</p>
        {tips.length > 1 && (
          <button
            type="button"
            className="vermi-bubble-next"
            onClick={() => {
              setTipIndex((i) => i + 1);
              setPinned(true);
              setBubbleOpen(true);
              if (hideTimer.current) clearTimeout(hideTimer.current);
            }}
          >
            Kolejna wskazówka →
          </button>
        )}
        <button
          type="button"
          className="vermi-bubble-close"
          onClick={() => {
            setPinned(false);
            setBubbleOpen(false);
          }}
          title="Zamknij"
          aria-label="Zamknij podpowiedź"
        >
          ✕
        </button>
      </div>

      <button
        type="button"
        className="vermi-figure"
        onClick={onMascotClick}
        onMouseEnter={() => {
          if (hideTimer.current) clearTimeout(hideTimer.current);
          setBubbleOpen(true);
        }}
        onMouseLeave={() => {
          if (pinned) return;
          if (hideTimer.current) clearTimeout(hideTimer.current);
          hideTimer.current = setTimeout(() => setBubbleOpen(false), 400);
        }}
        title="VERMI — kliknij po podpowiedź"
        aria-label="VERMI — asystent. Kliknij po podpowiedź do tej strony."
      >
        <span className="vermi-glow" aria-hidden="true" />
        <span className="vermi-shadow" aria-hidden="true" />
        {/* key wymusza ponowne odtworzenie animacji przy zmianie miny */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={mood} src={SRC[mood]} alt="" aria-hidden="true" draggable={false} />
      </button>

      <button
        type="button"
        className="vermi-hide"
        onClick={() => setDockedPersisted(true)}
        title="Zwiń VERMI do krążka"
        aria-label="Zwiń maskotkę VERMI"
      >
        −
      </button>
    </div>
  );
}
