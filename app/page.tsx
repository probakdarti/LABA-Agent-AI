"use client";

import { Dashboard } from "./components/Dashboard";
import { Landing } from "./components/Landing";
import { useAuth } from "./components/AuthProvider";

// Strona startowa (L11/W1):
//   • zalogowany  → Dashboard (centrum dowodzenia z live data)
//   • niezalogowany → landing page z CTA "Zacznij za darmo"
export default function Home() {
  const { user } = useAuth();
  return user ? <Dashboard /> : <Landing />;
}
