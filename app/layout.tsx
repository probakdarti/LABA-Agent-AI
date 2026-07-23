import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "./components/NavBar";
import { AuthProvider } from "./components/AuthProvider";

export const metadata: Metadata = {
  title: "VERMI — Senior Project Manager",
  description: "Chatbot AI zbudowany na Next.js i Vercel AI SDK",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body>
        <AuthProvider>
          <div className="app-shell">
            <NavBar />
            <main className="app-main">{children}</main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
