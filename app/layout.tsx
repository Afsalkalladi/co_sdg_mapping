// ──────────────────────────────────────────────────────────────────────
// WHAT: The outermost HTML shell for every page: <html>, <body>, the Inter font and the global CSS.
// NOTE: Signed-in pages get a second layout with the header: app/(main)/layout.tsx.
// ──────────────────────────────────────────────────────────────────────

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "CO Mapping",
  description: "Course outcome mapping to SDGs, POs, PSOs and WKs",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
