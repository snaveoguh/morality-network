import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/providers/WagmiProvider";
import { ThemeProvider } from "@/lib/theme";
import { MarqueeBanner } from "@/components/layout/MarqueeBanner";
import { ExtensionBanner } from "@/components/layout/ExtensionBanner";
import { SITE_URL, withBrand } from "@/lib/brand";
import { InstallPrompt } from "@/components/layout/InstallPrompt";
import { BetaToast } from "@/components/layout/BetaToast";
import { PooterNotificationHub } from "@/components/notifications/PooterNotificationHub";
import { DevBanner } from "@/components/layout/DevBanner";
import { WorkspaceDock } from "@/components/nextstep/WorkspaceDock";
import { MenuBar } from "@/components/nextstep/MenuBar";

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
    "theme-color": "#444444",
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
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className="min-h-screen overflow-x-hidden font-sans text-[var(--ink)] antialiased">
        <ThemeProvider>
          <Providers>
            {/* NeXT top menu bar (24px tall, fixed) */}
            <MenuBar />

            {/* Vertical Workspace dock on the LEFT (64px wide, fixed) */}
            <WorkspaceDock />

            {/* Main desktop area — offset for dock + menu */}
            <div className="pl-0 md:pl-16 pt-6">
              <DevBanner />
              <MarqueeBanner />
              <ExtensionBanner />
              <main className="mx-auto max-w-7xl overflow-x-hidden px-2 py-2 sm:px-4">
                {children}
              </main>
            </div>

            <InstallPrompt />
            <BetaToast />
            <PooterNotificationHub />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
