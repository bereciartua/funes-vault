import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";

import { TooltipProvider } from "../components/ui/tooltip";
import { PwaRegister } from "../features/pwa/PwaRegister";
import { themeBootScript } from "../features/pwa/theme-preference";
import { ThemeManager } from "../features/pwa/ThemeManager";
import { brand } from "../lib/brand";

const inter = Inter({
  subsets: ["latin"],
  display: "swap"
});

export const metadata: Metadata = {
  title: "Funes Vault — Your AI memory, under your control",
  description:
    "Keep durable context in a private vault and share only what approved AI assistants, agents, and tools are allowed to receive.",
  applicationName: "Funes Vault",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Funes"
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: "/icons/apple-touch-icon.png"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: brand.lightBackground },
    { media: "(prefers-color-scheme: dark)", color: brand.darkBackground }
  ]
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: themeBootScript }}
        />
      </head>
      <body className={inter.className}>
        <ThemeManager />
        <PwaRegister />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
