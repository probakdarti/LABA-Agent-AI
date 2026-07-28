"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { VermiLockup } from "../components/VermiLockup";
import { ThemeToggle } from "../components/ThemeToggle";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        if (!data.session) {
          setInfo("Konto utworzone. Sprawdź email, aby potwierdzić, i zaloguj się.");
          setMode("login");
          return;
        }
        router.replace("/");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        router.replace("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coś poszło nie tak.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, position: "relative" }}>
      <div style={{ position: "absolute", top: 16, right: 16 }}>
        <ThemeToggle />
      </div>
      <div className="surface" style={{ width: "100%", maxWidth: 380, padding: 24 }}>
        {/* Pełny znak marki — maskotka nad wordmarkiem (wersja pionowa). */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <VermiLockup variant="vertical" width={216} />
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
          {mode === "login" ? "Logowanie" : "Rejestracja"}
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20 }}>
          {mode === "login"
            ? "Zaloguj się, aby zobaczyć swoje dane."
            : "Załóż konto — Twoje dane będą prywatne."}
        </p>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@przyklad.pl"
            autoComplete="email"
            className="input"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="hasło (min. 6 znaków)"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="input"
          />

          {error && <div style={{ color: "var(--danger)", fontSize: 13 }}>⚠️ {error}</div>}
          {info && <div style={{ color: "var(--brand)", fontSize: 13 }}>{info}</div>}

          <button type="submit" disabled={busy} className="btn-primary" style={{ width: "100%" }}>
            {busy ? "Chwila…" : mode === "login" ? "Zaloguj się" : "Zarejestruj się"}
          </button>
        </form>

        <div style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: "var(--muted)" }}>
          {mode === "login" ? "Nie masz konta? " : "Masz już konto? "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
              setInfo(null);
            }}
            style={{ background: "transparent", border: "none", color: "var(--brand)", cursor: "pointer", fontSize: 13 }}
          >
            {mode === "login" ? "Zarejestruj się" : "Zaloguj się"}
          </button>
        </div>
      </div>
    </div>
  );
}
