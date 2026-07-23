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

// Strony dostępne bez logowania.
const PUBLIC_PATHS = ["/login"];

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
  useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_PATHS.includes(pathname);
    if (!user && !isPublic) router.replace("/login");
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
          color: "#9a9ac0",
        }}
      >
        Ładowanie…
      </div>
    );
  }

  const isPublic = PUBLIC_PATHS.includes(pathname);
  // Podczas przekierowania nie renderujemy chronionej treści.
  if (!user && !isPublic) return null;

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
