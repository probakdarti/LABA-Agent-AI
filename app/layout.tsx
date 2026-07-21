import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "./components/NavBar";

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
        <div className="app-shell">
          <NavBar />
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
