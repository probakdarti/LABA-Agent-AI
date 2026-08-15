"use client";

import Link from "next/link";
import { Icon, type IconName } from "./BrandIcons";
import { VermiLockup } from "./VermiLockup";
import { ThemeToggle } from "./ThemeToggle";

// ─────────────────────────────────────────────────────────────────────────────
// Landing page (Lekcja 11, Warsztat 1) — strona "/" dla NIEZALOGOWANYCH.
// Zalogowany użytkownik widzi Dashboard (patrz app/page.tsx).
//
// Uwaga: korzysta wyłącznie z istniejących tokenów motywu (--brand, --surface,
// --text, --muted…) i z zestawu ikon marki — nie wprowadza nowych kolorów.
// ─────────────────────────────────────────────────────────────────────────────

const FEATURES: { icon: IconName; title: string; desc: string }[] = [
  {
    icon: "checklist",
    title: "PM TO DO — zadania z terminem",
    desc: "Dodajesz zadania z datą, suwakiem ustawiasz postęp, a agent odpowiada, co masz na dziś.",
  },
  {
    icon: "knowledge",
    title: "Zna dokumenty Twojej firmy",
    desc: "Wgrywasz pliki, agent odpowiada z Twoich treści i zawsze podaje źródło (RAG).",
  },
  {
    icon: "travel",
    title: "Asystent podróży",
    desc: "Prognoza na tydzień, restauracje z linkiem do Map i porównanie ofert wyjazdów.",
  },
  {
    icon: "think",
    title: "Pamięta Twoje rozmowy",
    desc: "Trwała pamięć w bazie — wracasz po tygodniu, a agent wie, co ustaliliście.",
  },
  {
    icon: "shield",
    title: "Prywatne dane i ochrona",
    desc: "Każde konto widzi tylko swoje dane. Do tego filtry bezpieczeństwa i limity zużycia.",
  },
  {
    icon: "briefings",
    title: "Pracuje 24/7",
    desc: "Cykliczne zadania robią poranny briefing i reagują na zdarzenia bez Ciebie.",
  },
];

function Hero() {
  return (
    <section style={{ position: "relative", overflow: "hidden", padding: "56px 20px 44px" }}>
      {/* Miękka poświata marki w tle — zbudowana z istniejącego --brand */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -200,
          left: "50%",
          transform: "translateX(-50%)",
          width: 900,
          height: 520,
          background:
            "radial-gradient(ellipse at center, color-mix(in srgb, var(--brand) 26%, transparent), transparent 68%)",
          filter: "blur(18px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          maxWidth: 780,
          margin: "0 auto",
          textAlign: "center",
          animation: "lpFade 0.6s ease both",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
          <VermiLockup variant="vertical" width={248} />
        </div>

        <h1
          style={{
            fontSize: "clamp(30px, 6vw, 50px)",
            lineHeight: 1.1,
            fontWeight: 800,
            letterSpacing: -0.5,
            margin: 0,
          }}
        >
          Twój asystent PM,
          <br />
          który zna Twoje projekty
        </h1>

        <p
          style={{
            color: "var(--muted)",
            fontSize: "clamp(15px, 2.2vw, 19px)",
            lineHeight: 1.55,
            maxWidth: 620,
            margin: "16px auto 0",
          }}
        >
          VERMI to agent AI z pamięcią, bazą wiedzy Twojej firmy i automatyzacją.
          Planuje, analizuje ryzyka i podsumowuje spotkania — po polsku.
        </p>

        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: 30,
          }}
        >
          <Link
            href="/login"
            className="btn-primary"
            style={{
              fontSize: 16,
              padding: "13px 26px",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            🚀 Zacznij za darmo
          </Link>
          <a
            href="#funkcje"
            className="btn"
            style={{
              fontSize: 16,
              padding: "13px 22px",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Zobacz, co potrafi
          </a>
        </div>

        <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>
          Bez karty. Konto zakładasz w 30 sekund.
        </p>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="funkcje" style={{ maxWidth: 960, margin: "0 auto", padding: "12px 20px 8px" }}>
      {/* 6 kart — na szerokim ekranie układa się w dwa równe rzędy po trzy */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(268px, 1fr))",
          gap: 14,
        }}
      >
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            className="surface"
            style={{
              padding: "18px 18px 20px",
              animation: `lpFade 0.5s ease ${0.08 * (i + 1)}s both`,
            }}
          >
            <span
              aria-hidden
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                borderRadius: 11,
                background: "color-mix(in srgb, var(--brand) 18%, transparent)",
                border: "1px solid color-mix(in srgb, var(--brand) 42%, transparent)",
                color: "var(--brand-fg)",
                marginBottom: 12,
              }}
            >
              <Icon name={f.icon} size={21} />
            </span>
            <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: "0 0 6px" }}>{f.title}</h3>
            <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.5, margin: 0 }}>
              {f.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Makieta interfejsu — pokazuje odpowiedź z cytowaniem źródła (RAG). */
function Demo() {
  return (
    <section style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 20px 8px" }}>
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <h2 style={{ fontSize: "clamp(22px, 3.4vw, 30px)", fontWeight: 800, margin: 0 }}>
          Zapytaj o cennik — odpowie z <span style={{ color: "var(--brand-fg)" }}>Twoich</span>{" "}
          dokumentów
        </h2>
        <p className="muted" style={{ fontSize: 14.5, marginTop: 8 }}>
          Wgrywasz pliki firmowe. Agent szuka w nich odpowiedzi i pokazuje, skąd ją ma.
        </p>
      </div>

      <div
        className="surface"
        style={{
          maxWidth: 680,
          margin: "0 auto",
          padding: 0,
          overflow: "hidden",
          animation: "lpFade 0.6s ease 0.1s both",
        }}
      >
        {/* Belka okna */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-2)",
          }}
        >
          <VermiLockup variant="compact" height={22} />
          <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>
            Chat z agentem
          </span>
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Pytanie użytkownika */}
          <div
            style={{
              alignSelf: "flex-end",
              maxWidth: "78%",
              padding: "10px 14px",
              borderRadius: 12,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              fontSize: 14,
            }}
          >
            Jaka jest cena wdrożenia dla 20 stanowisk?
          </div>

          {/* Odpowiedź agenta */}
          <div
            style={{
              alignSelf: "flex-start",
              maxWidth: "88%",
              padding: "12px 14px",
              borderRadius: 12,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              fontSize: 14,
              lineHeight: 1.55,
            }}
          >
            <div style={{ marginBottom: 6 }}>
              📋 <strong>Kontekst</strong> — sprawdzam cennik wdrożeń.
            </div>
            <div>
              Dla <strong>20 stanowisk</strong> obowiązuje pakiet <em>Business</em>: wdrożenie
              12 400 zł netto + 79 zł/mies. za stanowisko. ✓ pewne
            </div>
            <div
              style={{
                marginTop: 10,
                paddingTop: 8,
                borderTop: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "var(--muted)",
              }}
            >
              <span aria-hidden>📄</span>
              <span>Źródło: Cennik_2026.pdf — sekcja „Pakiety"</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CtaFooter() {
  return (
    <section style={{ padding: "48px 20px 64px" }}>
      <div
        style={{
          maxWidth: 680,
          margin: "0 auto",
          textAlign: "center",
          padding: "34px 24px",
          borderRadius: 18,
          border: "1px solid color-mix(in srgb, var(--brand) 45%, var(--border))",
          background:
            "linear-gradient(160deg, color-mix(in srgb, var(--brand) 16%, transparent), transparent 70%), var(--surface)",
        }}
      >
        <h2 style={{ fontSize: "clamp(21px, 3.2vw, 28px)", fontWeight: 800, margin: 0 }}>
          Gotowy? Zacznij w 30 sekund.
        </h2>
        <p className="muted" style={{ fontSize: 14.5, margin: "10px 0 22px" }}>
          Zakładasz konto, wgrywasz pierwszy dokument i pytasz. Tyle.
        </p>
        <Link
          href="/login"
          className="btn-primary"
          style={{ fontSize: 16, padding: "13px 28px", textDecoration: "none", display: "inline-block" }}
        >
          Stwórz konto
        </Link>
      </div>

      <p className="muted" style={{ textAlign: "center", fontSize: 12.5, marginTop: 26 }}>
        VERMI — PM ASSISTANT · agent AI do zadań specjalnych
      </p>
      <p
        className="muted"
        style={{ textAlign: "center", fontSize: 12.5, marginTop: 6, opacity: 0.85 }}
      >
        Autor — Paweł Robak
      </p>
    </section>
  );
}

/**
 * Tło landingu zależne od motywu:
 *   • ciemny  — rozgwieżdżone niebo (VERMI w kosmosie),
 *   • jasny   — błękitne obłoki.
 * Warstwa jest przyklejona do okna (position: fixed) i nieklikalna, więc nie
 * wchodzi w drogę treści. Style deklarujemy dla wszystkich trzech stanów
 * motywu: systemowego, wymuszonego jasnego i wymuszonego ciemnego.
 */
function SkyBackground() {
  return (
    <div className="lp-sky" aria-hidden>
      <div className="lp-stars lp-stars-1" />
      <div className="lp-stars lp-stars-2" />
      <div className="lp-stars lp-stars-3" />
      <div className="lp-clouds" />
    </div>
  );
}

export function Landing() {
  return (
    <div style={{ position: "relative" }}>
      <SkyBackground />

      {/* Górny pasek: logowanie po lewej, przełącznik motywu po prawej */}
      <div style={{ position: "absolute", top: 14, left: 16, zIndex: 2 }}>
        <Link
          href="/login"
          className="btn"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "8px 16px",
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          <Icon name="logout" size={16} />
          Zaloguj
        </Link>
      </div>

      <div style={{ position: "absolute", top: 14, right: 16, zIndex: 2 }}>
        <ThemeToggle />
      </div>

      <div style={{ position: "relative", zIndex: 1 }}>
        <Hero />
        <Features />
        <Demo />
        <CtaFooter />
      </div>

      <style>{`
        @keyframes lpFade {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Warstwa tła ─────────────────────────────────────────────────── */
        .lp-sky {
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
        }
        .lp-sky > * { position: absolute; inset: -10%; }

        /* ── Motyw JASNY: błękitne obłoki (domyślnie) ─────────────────────
           Widoczność sterowana przez display, NIE przez opacity — animacja
           migotania też zmienia opacity i nadpisałaby zwykłą regułę. */
        .lp-stars { display: none; }
        .lp-clouds {
          display: block;
          background-image:
            radial-gradient(closest-side, rgba(120, 180, 240, 0.62), transparent 76%),
            radial-gradient(closest-side, rgba(140, 195, 252, 0.56), transparent 76%),
            radial-gradient(closest-side, rgba(170, 215, 255, 0.72), transparent 74%),
            radial-gradient(closest-side, rgba(150, 200, 245, 0.52), transparent 76%),
            radial-gradient(closest-side, rgba(185, 225, 255, 0.68), transparent 74%),
            linear-gradient(180deg, rgba(176, 216, 250, 0.85), rgba(255, 255, 255, 0) 52%);
          background-repeat: no-repeat;
          background-size:
            62vw 40vw, 48vw 30vw, 70vw 42vw, 40vw 26vw, 55vw 34vw, 100% 100%;
          background-position:
            -8vw 4vh, 62vw 12vh, 24vw 52vh, 78vw 62vh, 6vw 86vh, 0 0;
          animation: lpDrift 90s ease-in-out infinite alternate;
        }

        /* ── Motyw CIEMNY: gwiazdy ───────────────────────────────────────── */
        @media (prefers-color-scheme: dark) {
          :root:not([data-theme="light"]) .lp-clouds { display: none; }
          :root:not([data-theme="light"]) .lp-stars  { display: block; }
        }
        :root[data-theme="dark"] .lp-clouds { display: none; }
        :root[data-theme="dark"] .lp-stars  { display: block; }
        :root[data-theme="light"] .lp-clouds { display: block; }
        :root[data-theme="light"] .lp-stars  { display: none; }

        /* Trzy warstwy gwiazd o różnej wielkości — dają wrażenie głębi. */
        .lp-stars-1 {
          background-image:
            radial-gradient(1.6px 1.6px at 32px 44px, #ffffff, transparent),
            radial-gradient(1.4px 1.4px at 168px 96px, #eaf2ff, transparent),
            radial-gradient(1.7px 1.7px at 88px 208px, #ffffff, transparent),
            radial-gradient(1.3px 1.3px at 232px 176px, #dbe8ff, transparent),
            radial-gradient(1.5px 1.5px at 296px 62px, #ffffff, transparent);
          background-size: 340px 260px;
          animation: lpTwinkle 5.5s ease-in-out infinite;
        }
        .lp-stars-2 {
          background-image:
            radial-gradient(1.1px 1.1px at 60px 120px, rgba(255,255,255,0.85), transparent),
            radial-gradient(1px 1px at 190px 36px, rgba(214,232,255,0.8), transparent),
            radial-gradient(1.2px 1.2px at 120px 250px, rgba(255,255,255,0.9), transparent),
            radial-gradient(1px 1px at 268px 148px, rgba(255,255,255,0.75), transparent);
          background-size: 300px 300px;
          animation: lpTwinkle 8s ease-in-out infinite 1.5s;
        }
        /* Kilka jaśniejszych gwiazd z delikatną poświatą. */
        .lp-stars-3 {
          background-image:
            radial-gradient(2.4px 2.4px at 140px 80px, #ffffff, rgba(255,255,255,0.25) 55%, transparent),
            radial-gradient(2.2px 2.2px at 420px 300px, #dff0ff, rgba(200,225,255,0.2) 55%, transparent),
            radial-gradient(2.6px 2.6px at 300px 470px, #ffffff, rgba(255,255,255,0.22) 55%, transparent);
          background-size: 560px 560px;
          animation: lpTwinkle 6.5s ease-in-out infinite 0.8s;
        }

        @keyframes lpTwinkle {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.55; }
        }
        @keyframes lpDrift {
          from { transform: translate3d(0, 0, 0); }
          to   { transform: translate3d(-3vw, 1.5vh, 0); }
        }

        /* Szanujemy ustawienie ograniczonego ruchu w systemie. */
        @media (prefers-reduced-motion: reduce) {
          [style*="lpFade"] { animation: none !important; }
          .lp-stars, .lp-clouds { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
