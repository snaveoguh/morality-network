"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-black/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <img
            src="https://morality.s3.eu-west-2.amazonaws.com/brand/glyph.png"
            alt="MO"
            className="h-4 w-4 opacity-60"
          />
          <span className="text-sm font-medium tracking-tight text-white">
            pooter world
          </span>
        </Link>

        {/* Tabs */}
        <nav className="flex items-center gap-1">
          <TabLink href="/" active={pathname === "/"}>
            Feed
          </TabLink>
          <TabLink
            href="/leaderboard"
            active={pathname === "/leaderboard"}
          >
            Leaderboard
          </TabLink>
          <TabLink
            href="/stumble"
            active={pathname === "/stumble"}
          >
            Stumble
          </TabLink>
        </nav>

        {/* Wallet */}
        <ConnectButton
          accountStatus="address"
          chainStatus="icon"
          showBalance={false}
        />
      </div>
    </header>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-4 py-2 text-sm font-medium tracking-wide transition-colors font-comic ${
        active
          ? "bg-[#2F80ED]/10 text-[#2F80ED]"
          : "text-zinc-400 hover:bg-white/5 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}
