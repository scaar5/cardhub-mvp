import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "sCARDs — Analytics & Sniper",
  description:
    "Valoración de cartas y cromos de fútbol (Panini, Topps) y alertas de chollos en Vinted y Wallapop.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-screen font-mono antialiased">{children}</body>
    </html>
  );
}
