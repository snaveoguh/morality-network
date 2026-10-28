import type { Metadata } from "next";
import { Inter, Geist_Mono, UnifrakturCook, Archivo_Black, Newsreader } from "next/font/google";
import "./globals.css";
import { Providers } from "@/providers/WagmiProvider";
import { ThemeProvider } from "@/lib/theme";
import { Header } from "@/components/layout/Header";
import { TabBar } from "@/components/layout/TabBar";
import { ExtensionBanner } from "@/components/layout/ExtensionBanner";
import { SITE_URL, withBrand } from "@/lib/brand";
import { InstallPrompt } from "@/components/layout/InstallPrompt";
import { PooterNotificationHub } from "@/components/notifications/PooterNotificationHub";
import { DevBanner } from "@/components/layout/DevBanner";
import { HideOnSoberRoutes } from "@/components/layout/HideOnSoberRoutes";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Old-English blackletter — ONLY the "pooter world" wordmark and "pw" mark.
const fraktur = UnifrakturCook({
  variable: "--font-fraktur",
  subsets: ["latin"],
  weight: "700",
});

// Serif headline face — direction C broadsheet (headlines, section labels).
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

// Tabloid headline face — retired from the front page, still used by
// older inner pages via .font-headline.
const archivo = Archivo_Black({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: "400",
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
    "theme-color": "#0d0d0d",
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
        className={`${inter.variable} ${geistMono.variable} ${fraktur.variable} ${archivo.variable} ${newsreader.variable} min-h-screen overflow-x-hidden bg-[var(--paper)] font-sans text-[var(--ink)] antialiased`}
      >
        <ThemeProvider>
        <Providers>
          <DevBanner />
          <HideOnSoberRoutes>
            <ExtensionBanner />
          </HideOnSoberRoutes>
          <Header />
          <main className="mx-auto max-w-7xl overflow-x-hidden px-4 py-2">{children}</main>
          <HideOnSoberRoutes>
            <TabBar />
          </HideOnSoberRoutes>
          <InstallPrompt />
          <HideOnSoberRoutes>
            <PooterNotificationHub />
          </HideOnSoberRoutes>
        </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
