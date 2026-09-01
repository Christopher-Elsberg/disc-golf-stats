import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Disc Golf Stats",
  description: "Disc golf scorecards, rating, handicap og statistik",
  applicationName: "Disc Golf Stats",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Disc Golf Stats",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1220",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="da">
      <body>{children}</body>
    </html>
  );
}
