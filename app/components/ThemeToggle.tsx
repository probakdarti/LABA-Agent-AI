"use client";

import { useEffect, useState } from "react";
import { Icon } from "./BrandIcons";

type Mode = "system" | "light" | "dark";
const NEXT: Record<Mode, Mode> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Mode, string> = { system: "Motyw: systemowy", light: "Motyw: jasny", dark: "Motyw: ciemny" };

function apply(mode: Mode) {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
  try {
    localStorage.setItem("theme", mode);
  } catch {
    /* ignore */
  }
}

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    const saved = (localStorage.getItem("theme") as Mode) || "system";
    setMode(saved);
  }, []);

  const cycle = () => {
    const next = NEXT[mode];
    setMode(next);
    apply(next);
  };

  return (
    <button type="button" className="icon-btn" onClick={cycle} title={LABEL[mode]} aria-label={LABEL[mode]}>
      <Icon name={mode === "light" ? "sun" : mode === "dark" ? "moon" : "system"} />
    </button>
  );
}
