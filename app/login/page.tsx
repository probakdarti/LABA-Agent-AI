"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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
        // Gdy potwierdzanie email jest włączone, sesja jest pusta.
        if (!data.session) {
          setInfo("Konto utworzone. Sprawdź email, aby potwierdzić, i zaloguj się.");
          setMode("login");
          return;
        }
        router.replace("/");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
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
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#12121a",
          border: "1px solid #333",
          borderRadius: 14,
          padding: 24,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
          🤖 VERMI — {mode === "login" ? "Logowanie" : "Rejestracja"}
        </h1>
        <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
          {mode === "login"
            ? "Zaloguj się, aby zobaczyć swoje rozmowy."
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
            style={inputStyle}
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="hasło (min. 6 znaków)"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            style={inputStyle}
          />

          {error && (
            <div style={{ color: "#e8b4b4", fontSize: 13 }}>⚠️ {error}</div>
          )}
          {info && <div style={{ color: "#8fce8f", fontSize: 13 }}>{info}</div>}

          <button
            type="submit"
            disabled={busy}
            style={{
              padding: "11px 16px",
              borderRadius: 10,
              border: "1px solid #6a4fd5",
              background: busy ? "#222" : "#3a2a6a",
              color: busy ? "#666" : "#ededed",
              fontSize: 15,
              fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Chwila…" : mode === "login" ? "Zaloguj się" : "Zarejestruj się"}
          </button>
        </form>

        <div style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: "#888" }}>
          {mode === "login" ? "Nie masz konta? " : "Masz już konto? "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
              setInfo(null);
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "#6ab0ff",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {mode === "login" ? "Zarejestruj się" : "Zaloguj się"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "11px 14px",
  borderRadius: 10,
  border: "1px solid #333",
  background: "#141414",
  color: "#ededed",
  fontSize: 15,
  outline: "none",
};
