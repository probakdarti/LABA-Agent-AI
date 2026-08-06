import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NavBar } from "./components/NavBar";
import { AuthProvider } from "./components/AuthProvider";
import { VermiMascot } from "./components/VermiMascot";

const APP_DESC =
  "Agent AI z pamięcią, bazą wiedzy Twojej firmy i automatyzacją. Planuje, analizuje ryzyka i podsumowuje spotkania — po polsku.";

export const metadata: Metadata = {
  // Bazowy adres — dzięki niemu og:image ma pełny URL (wymagane przez LinkedIn/Slack).
  metadataBase: new URL("https://verme.eu"),
  title: "VERMI — PM ASSISTANT",
  description: APP_DESC,
  manifest: "/site.webmanifest",
  applicationName: "VERMI",
  // Ikony: app/icon.svg i app/apple-icon.png Next podłącza automatycznie.
  // Podgląd w social media (L11/W4): obraz generuje app/opengraph-image.tsx —
  // Next sam dopisuje go do openGraph.images oraz twitter.images.
  openGraph: {
    type: "website",
    locale: "pl_PL",
    url: "https://verme.eu",
    siteName: "VERMI",
    title: "VERMI — PM ASSISTANT",
    description: APP_DESC,
  },
  twitter: {
    card: "summary_large_image",
    title: "VERMI — PM ASSISTANT",
    description: APP_DESC,
  },
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
