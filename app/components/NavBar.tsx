"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";

const LINKS = [
  { href: "/", label: "🏠 Dashboard", primary: true },
  { href: "/agent", label: "🤖 Agent" },
  { href: "/react", label: "🔄 ReAct" },
  { href: "/travel", label: "✈️ Podróże" },
  { href: "/chat", label: "💬 Chat" },
  { href: "/history", label: "📜 Historia" },
  { href: "/upload", label: "📚 Baza wiedzy" },
  { href: "/knowledge", label: "🔎 Wiedza" },
  { href: "/email-triage", label: "📧 E-mail Triage" },
  { href: "/report", label: "📊 Raporty" },
  { href: "/competitor", label: "🏢 Konkurencja" },
  { href: "/meeting-summary", label: "📋 Spotkania" },
  { href: "/think", label: "🧠 Myślenie" },
  { href: "/search", label: "🌐 Szukaj" },
  { href: "/generate", label: "🎨 Grafiki" },
  { href: "/vision", label: "👁️ Vision" },
  { href: "/fewshot", label: "📚 Słownik" },
  { href: "/format", label: "📐 Formater" },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {LINKS.map((link) => {
        const active = pathname === link.href;
        const cls = [
          "nav-link",
          "primary" in link && link.primary ? "primary" : "",
          active ? "active" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <Link key={link.href} href={link.href} className={cls} onClick={onNavigate}>
            {link.label}
          </Link>
        );
      })}
    </>
  );
}

// Stopka z zalogowanym użytkownikiem + wylogowanie.
function UserBox() {
  const { user } = useAuth();
  const handleLogout = async () => {
    await supabase.auth.signOut();
    // AuthProvider przekieruje na /login po zmianie sesji.
  };
  return (
    <div style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid #222" }}>
      <div
        style={{
          fontSize: 12,
          color: "#888",
          padding: "0 10px 8px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={user?.email ?? ""}
      >
        👤 {user?.email}
      </div>
      <button
        type="button"
        onClick={handleLogout}
        style={{
          width: "100%",
          padding: "8px 14px",
          borderRadius: 8,
          border: "1px solid #7a3b3b",
          background: "transparent",
          color: "#e08a8a",
          fontSize: 14,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        🚪 Wyloguj
      </button>
    </div>
  );
}

export function NavBar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();

  // Zamknij szufladę po zmianie strony
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Nawigacji nie pokazujemy na stronie logowania ani przed zalogowaniem.
  if (pathname === "/login" || !user) return null;

  return (
    <>
      {/* Sidebar — desktop */}
      <nav className="app-sidebar">
        <div style={{ fontSize: 16, fontWeight: 700, padding: "4px 10px 12px" }}>
          🤖 VERMI
        </div>
        <NavLinks />
        <UserBox />
      </nav>

      {/* Pasek mobilny z hamburgerem */}
      <div className="app-topbar">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Otwórz menu"
          style={{
            background: "transparent",
            border: "1px solid #333",
            borderRadius: 8,
            color: "#ededed",
            fontSize: 18,
            padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          ☰
        </button>
        <span style={{ fontWeight: 700 }}>🤖 VERMI</span>
      </div>

      {/* Szuflada mobilna + tło */}
      <div
        className={`app-drawer-backdrop${open ? " open" : ""}`}
        onClick={() => setOpen(false)}
      />
      <nav className={`app-drawer${open ? " open" : ""}`}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "4px 10px 12px",
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 700 }}>🤖 VERMI</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Zamknij menu"
            style={{
              background: "transparent",
              border: "none",
              color: "#888",
              fontSize: 18,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
        <NavLinks onNavigate={() => setOpen(false)} />
        <UserBox />
      </nav>
    </>
  );
}
