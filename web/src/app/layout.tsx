import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/providers/WagmiProvider";
import { Header } from "@/components/layout/Header";
import { MarqueeBanner } from "@/components/layout/MarqueeBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "pooter world — Permissionless News & Onchain Discussion",
  description:
    "Rate, discuss, and tip news content directly onchain. Censorship-resistant conversations powered by Base.",
  icons: {
    icon: "https://morality.s3.eu-west-2.amazonaws.com/brand/glyph.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-black font-sans text-white antialiased`}
      >
        <Providers>
          <MarqueeBanner />
          <Header />
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
