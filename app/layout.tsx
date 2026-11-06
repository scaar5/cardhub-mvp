import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: "sCARDs — Chollos en cartas y cromos",
  description:
    "Valoración de cartas y cromos de fútbol (Panini, Topps) y alertas de chollos en eBay, Vinted y Wallapop.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
