import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/providers/WagmiProvider";
import { ThemeProvider } from "@/lib/theme";
import { SITE_URL, withBrand } from "@/lib/brand";
import { InstallPrompt } from "@/components/layout/InstallPrompt";
import { BetaToast } from "@/components/layout/BetaToast";
import { PooterNotificationHub } from "@/components/notifications/PooterNotificationHub";
import { DevBanner } from "@/components/layout/DevBanner";
import { DocumentExaminer } from "@/components/xerox/DocumentExaminer";
import { MemoHeader } from "@/components/xerox/MemoHeader";
import { MemoFooter } from "@/components/xerox/MemoFooter";

// ============================================================================
// ROOT LAYOUT — Xerox PARC research memo shell
//
// Two columns:
//   - Left (240px sticky):  Document Examiner outline tree
//   - Right (flex):         MemoHeader band → main content → MemoFooter
//
// Pure ink-on-paper. 1px rules. No newspaper Fraktur. All-caps Helvetica.
// ============================================================================

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    "theme-color": "#F8F4EC",
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
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen overflow-x-hidden bg-[var(--paper)] font-sans text-[var(--ink)] antialiased`}
      >
        <ThemeProvider>
          <Providers>
            <DevBanner />
            <div className="memo-shell">
              <aside className="memo-examiner-col">
                <DocumentExaminer />
              </aside>
              <div className="memo-main-col">
                <MemoHeader />
                <main className="mx-auto max-w-[1080px] py-3">{children}</main>
                <MemoFooter />
              </div>
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
