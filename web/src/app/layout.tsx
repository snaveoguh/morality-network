import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display, Libre_Baskerville, UnifrakturCook } from "next/font/google";
import "./globals.css";
import { Providers } from "@/providers/WagmiProvider";
import { Header } from "@/components/layout/Header";
import { MarqueeBanner } from "@/components/layout/MarqueeBanner";
import { ExtensionBanner } from "@/components/layout/ExtensionBanner";
import { SITE_URL, withBrand } from "@/lib/brand";
import { InstallPrompt } from "@/components/layout/InstallPrompt";
import { BetaToast } from "@/components/layout/BetaToast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  style: ["normal", "italic"],
});

const baskerville = Libre_Baskerville({
  variable: "--font-baskerville",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

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
    "theme-color": "#1A1A1A",
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
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${baskerville.variable} ${fraktur.variable} min-h-screen overflow-x-hidden bg-[var(--paper)] font-sans text-[var(--ink)] antialiased`}
      >
        <Providers>
          <MarqueeBanner />
          <ExtensionBanner />
          <Header />
          <main className="mx-auto max-w-7xl px-4 py-2">{children}</main>
          <InstallPrompt />
          <BetaToast />
        </Providers>
      </body>
    </html>
  );
}
