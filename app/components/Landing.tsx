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
    icon: "think",
    title: "Pamięta Twoje rozmowy",
    desc: "Trwała pamięć w bazie — wracasz po tygodniu i agent wie, co ustaliliście.",
  },
  {
    icon: "knowledge",
    title: "Zna dokumenty Twojej firmy",
    desc: "Wgrywasz pliki, agent odpowiada z Twoich treści i podaje źródło (RAG).",
  },
  {
    icon: "shield",
    title: "Prywatne dane per użytkownik",
    desc: "Każde konto widzi tylko swoje rozmowy, pliki i notatki. Plus filtry bezpieczeństwa.",
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
    <section id="funkcje" style={{ maxWidth: 1000, margin: "0 auto", padding: "12px 20px 8px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
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
    </section>
  );
}

export function Landing() {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "absolute", top: 14, right: 16, zIndex: 2 }}>
        <ThemeToggle />
      </div>

      <Hero />
      <Features />
      <Demo />
      <CtaFooter />

      <style>{`
        @keyframes lpFade {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="lpFade"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
