"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AuthContextValue = { user: User | null; loading: boolean };
const AuthContext = createContext<AuthContextValue>({ user: null, loading: true });

export const useAuth = () => useContext(AuthContext);

// Strony tylko dla niezalogowanych (zalogowany zostaje odesłany na "/").
const PUBLIC_PATHS = ["/login"];

// Strony dostępne ZAWSZE — bez przekierowania w żadną stronę.
// Treść zależy od stanu logowania: "/" = landing (gość) albo Dashboard (użytkownik).
const HYBRID_PATHS = ["/"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Wczytanie sesji + nasłuch zmian logowania.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Ochrona tras: niezalogowany → /login; zalogowany na /login → /
  // Trasy hybrydowe ("/") są wyłączone z obu przekierowań — decyduje o nich strona.
  useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_PATHS.includes(pathname);
    const isHybrid = HYBRID_PATHS.includes(pathname);
    if (!user && !isPublic && !isHybrid) router.replace("/login");
    else if (user && isPublic) router.replace("/");
  }, [user, loading, pathname, router]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted)",
        }}
      >
        Ładowanie…
      </div>
    );
  }

  const isPublic = PUBLIC_PATHS.includes(pathname);
  const isHybrid = HYBRID_PATHS.includes(pathname);
  // Podczas przekierowania nie renderujemy chronionej treści.
  // Trasy hybrydowe renderujemy zawsze (landing dla gościa).
  if (!user && !isPublic && !isHybrid) return null;

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
