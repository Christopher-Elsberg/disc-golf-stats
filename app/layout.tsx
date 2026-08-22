import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Disc Golf Stats",
  description: "Disc golf scorecards, rating, handicap og statistik",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="da">
      <body>{children}</body>
    </html>
  );
}
