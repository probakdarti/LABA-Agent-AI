import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NavBar } from "./components/NavBar";
import { AuthProvider } from "./components/AuthProvider";
import { VermiMascot } from "./components/VermiMascot";

export const metadata: Metadata = {
  title: "VERMI — PM ASSISTANT",
  description: "Twój agent AI do zadań specjalnych",
  manifest: "/site.webmanifest",
  applicationName: "VERMI",
  // Ikony: app/icon.svg i app/apple-icon.png Next podłącza automatycznie.
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

// Ustawia motyw z localStorage zanim strona się wyrenderuje (bez migotania).
const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(t&&t!=='system')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <AuthProvider>
          <div className="app-shell">
            <NavBar />
            <main className="app-main">{children}</main>
          </div>
          {/* Maskotka VERMI — obecna na każdej stronie, zawsze w prawym dolnym rogu. */}
          <VermiMascot />
        </AuthProvider>
      </body>
    </html>
  );
}
