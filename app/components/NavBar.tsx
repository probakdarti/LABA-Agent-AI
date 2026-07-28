"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { Icon, type IconName } from "./BrandIcons";
import { VermiLockup } from "./VermiLockup";
import { ThemeToggle } from "./ThemeToggle";

const LINKS: { href: string; label: string; icon: IconName; primary?: boolean }[] = [
  { href: "/", label: "Dashboard", icon: "dashboard", primary: true },
  { href: "/agent", label: "Agent", icon: "agent" },
  { href: "/react", label: "ReAct", icon: "react" },
  { href: "/travel", label: "Podróże", icon: "travel" },
  { href: "/chat", label: "Chat", icon: "chat" },
  { href: "/history", label: "Historia", icon: "history" },
  { href: "/upload", label: "Baza wiedzy", icon: "upload" },
  { href: "/knowledge", label: "Wiedza", icon: "knowledge" },
  { href: "/email-triage", label: "E-mail Triage", icon: "email" },
  { href: "/report", label: "Raporty", icon: "report" },
  { href: "/competitor", label: "Konkurencja", icon: "competitor" },
  { href: "/meeting-summary", label: "Spotkania", icon: "meeting" },
  { href: "/briefings", label: "Briefingi", icon: "briefings" },
  { href: "/webhook-events", label: "Zdarzenia", icon: "webhook" },
  { href: "/think", label: "Myślenie", icon: "think" },
  { href: "/search", label: "Szukaj", icon: "search" },
  { href: "/generate", label: "Grafiki", icon: "generate" },
  { href: "/vision", label: "Vision", icon: "vision" },
  { href: "/fewshot", label: "Słownik", icon: "dictionary" },
  { href: "/format", label: "Formater", icon: "format" },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {LINKS.map((link) => {
        const active = pathname === link.href;
        const cls = ["nav-link", link.primary ? "primary" : "", active ? "active" : ""]
          .filter(Boolean)
          .join(" ");
        return (
          <Link key={link.href} href={link.href} className={cls} onClick={onNavigate}>
            <Icon name={link.icon} />
            <span>{link.label}</span>
          </Link>
        );
      })}
    </>
  );
}

function UserBox() {
  const { user } = useAuth();
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };
  return (
    <div style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid var(--border)" }}>
      <div
        style={{
          fontSize: 12,
          color: "var(--muted)",
          padding: "0 10px 8px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={user?.email ?? ""}
      >
        {user?.email}
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="nav-link"
        style={{ width: "100%", cursor: "pointer", color: "var(--danger)", background: "transparent" }}
      >
        <Icon name="logout" />
        <span>Wyloguj</span>
      </button>
    </div>
  );
}

function Brand({ withToggle = true }: { withToggle?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 8,
        padding: "4px 6px 14px",
      }}
    >
      <Link href="/" aria-label="VERMI — strona główna" style={{ display: "inline-flex" }}>
        <VermiLockup width={152} />
      </Link>
      {withToggle && <ThemeToggle />}
    </div>
  );
}

export function NavBar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (pathname === "/login" || !user) return null;

  return (
    <>
      {/* Sidebar — desktop */}
      <nav className="app-sidebar">
        <Brand />
        <NavLinks />
        <UserBox />
      </nav>

      {/* Pasek mobilny */}
      <div className="app-topbar">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Otwórz menu"
          className="icon-btn"
        >
          ☰
        </button>
        <span style={{ flex: 1 }}>
          <Link href="/" aria-label="VERMI — strona główna" style={{ display: "inline-flex" }}>
            <VermiLockup variant="compact" height={32} />
          </Link>
        </span>
        <ThemeToggle />
      </div>

      {/* Szuflada mobilna */}
      <div className={`app-drawer-backdrop${open ? " open" : ""}`} onClick={() => setOpen(false)} />
      <nav className={`app-drawer${open ? " open" : ""}`}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, padding: "4px 6px 14px" }}>
          <VermiLockup width={152} />
          <button type="button" onClick={() => setOpen(false)} aria-label="Zamknij menu" className="icon-btn">
            ✕
          </button>
        </div>
        <NavLinks onNavigate={() => setOpen(false)} />
        <UserBox />
      </nav>
    </>
  );
}
