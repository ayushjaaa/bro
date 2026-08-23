import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flavor Admin",
  description: "Product add & taxonomy navigation admin panel",
};

// Minimal by design (per ADMIN_PANEL_IMPLEMENTATION.md §2) — no Sidebar/TopBar here, so that
// (auth) pages (login, set-password) don't show dashboard chrome. Only (dashboard)/layout.tsx
// mounts those.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full h-full bg-neutral-50 text-neutral-900" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
