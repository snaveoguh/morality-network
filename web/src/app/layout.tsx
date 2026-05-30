import type { Metadata } from "next";
import { Inter, Geist_Mono, UnifrakturCook } from "next/font/google";
import "./globals.css";
import { Providers } from "@/providers/WagmiProvider";
import { ThemeProvider } from "@/lib/theme";
import { Header } from "@/components/layout/Header";
import { MarqueeBanner } from "@/components/layout/MarqueeBanner";
import { ExtensionBanner } from "@/components/layout/ExtensionBanner";
import { SITE_URL, withBrand } from "@/lib/brand";
import { InstallPrompt } from "@/components/layout/InstallPrompt";
import { BetaToast } from "@/components/layout/BetaToast";
import { PooterNotificationHub } from "@/components/notifications/PooterNotificationHub";
import { DevBanner } from "@/components/layout/DevBanner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Old-English blackletter — kept ONLY for the article drop-cap (the one
// surviving thread from the newspaper era).
const fraktur = UnifrakturCook({
  variable: "--font-fraktur",
  subsets: ["latin"],
  weight: "700",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: withBrand("Permissionless News & Onchain Discussion"),
  description:
    "Rate, discuss, and tip news content directly onchain. Censorship-resistant conversations powered by Base.",
  manifest: "/manifest.json",
  icons: {
    icon: "/pooter-icon-192.png",
    apple: "/pooter-icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "pooter world",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "theme-color": "#0b1736",
  },
  openGraph: {
    type: "website",
    siteName: "pooter world",
    locale: "en_US",
    title: withBrand("Permissionless News & Onchain Discussion"),
    description:
      "Rate, discuss, and tip news content directly onchain. Censorship-resistant conversations powered by Base.",
  },
  twitter: {
    card: "summary_large_image",
    title: "pooter world",
    description:
      "Permissionless news feed. Rate, discuss, and tip articles onchain via Base L2.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${geistMono.variable} ${fraktur.variable} min-h-screen overflow-x-hidden bg-[var(--paper)] font-sans text-[var(--ink)] antialiased`}
      >
        <ThemeProvider>
        <Providers>
          <DevBanner />
          <MarqueeBanner />
          <ExtensionBanner />
          <Header />
          <main className="mx-auto max-w-7xl overflow-x-hidden px-4 py-2">{children}</main>
          <InstallPrompt />
          <BetaToast />
          <PooterNotificationHub />
        </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
