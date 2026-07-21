"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/", label: "🏠 Dashboard", primary: true },
  { href: "/agent", label: "🤖 Agent" },
  { href: "/react", label: "🔄 ReAct" },
  { href: "/travel", label: "✈️ Podróże" },
  { href: "/chat", label: "💬 Chat" },
  { href: "/history", label: "📜 Historia" },
  { href: "/upload", label: "📚 Baza wiedzy" },
  { href: "/knowledge", label: "🔎 Wiedza" },
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

export function NavBar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Zamknij szufladę po zmianie strony
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Sidebar — desktop */}
      <nav className="app-sidebar">
        <div style={{ fontSize: 16, fontWeight: 700, padding: "4px 10px 12px" }}>
          🤖 VERMI
        </div>
        <NavLinks />
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
      </nav>
    </>
  );
}
