"use client";

import { useState, useRef, useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoChrome } from "@/components/layout/Masthead";
import { MoPrice } from "@/components/layout/MoPrice";
import { SearchBar } from "@/components/layout/SearchBar";
import { SubmitLink } from "@/components/layout/SubmitLink";
import { TranslateMenu } from "@/components/layout/TranslateMenu";

const NAV_LINKS = [
  { href: "/", label: "Feed" },
  { href: "/proposals", label: "Proposals" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/style-guide", label: "Style Guide" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b-2 border-[var(--rule)] bg-[var(--paper)]">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4">
        {/* Logo — small fraktur + hover popover */}
        <LogoWithPopover />

        {/* Nav — monospace, underline-on-active */}
        <nav className="flex items-center gap-0">
          {NAV_LINKS.map(({ href, label }, i) => {
            const isActive =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <span key={href} className="flex items-center">
                {i > 0 && <span className="mx-2 text-[var(--rule-light)]">|</span>}
                <Link
                  href={href}
                  className={`font-mono text-xs uppercase tracking-wider transition-colors ${
                    isActive
                      ? "font-bold text-[var(--ink)] underline underline-offset-4 decoration-2 decoration-[var(--rule)]"
                      : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                  }`}
                >
                  {label}
                </Link>
              </span>
            );
          })}
        </nav>

        {/* Search + Submit + Price */}
        <div className="flex items-center gap-2">
          <TranslateMenu />
          <SearchBar />
          <SubmitLink />
          <MoPrice />
        </div>

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

// ============================================================================
// LOGO WITH HOVER POPOVER — "wtf is this?"
// ============================================================================

function LogoWithPopover() {
  const [show, setShow] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleEnter() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setShow(true), 350);
  }
  function handleLeave() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setShow(false), 200);
  }

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  return (
    <div
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <Link href="/" className="flex items-center gap-1.5">
        <MoChrome className="h-5 w-auto" />
        <span className="font-masthead text-lg text-[var(--ink)]">
          pooter world
          <sup className="ml-0.5 font-mono text-[7px] tracking-tight text-[var(--ink-faint)]">
            {"\u2310\u25E8-\u25E8"}
          </sup>
        </span>
      </Link>

      {/* Hover popover */}
      {show && (
        <div
          className="absolute left-0 top-full z-[9999] mt-2 w-80 border-2 border-[var(--rule)] bg-[var(--paper)] p-4 shadow-xl"
          onMouseEnter={() => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }}
          onMouseLeave={handleLeave}
        >
          {/* Top rule */}
          <div className="mb-2 h-px w-full bg-[var(--rule)]" />
          <div className="mb-3 mt-px h-[2px] w-full bg-[var(--rule)]" />

          <p className="font-headline text-sm font-bold leading-snug text-[var(--ink)]">
            A decentralised information highway.
          </p>
          <p className="mt-2 font-body-serif text-xs leading-relaxed text-[var(--ink-light)]">
            Real-time current affairs from 70+ sources across the political spectrum.
            Rate, discuss, and tip content directly onchain. No middlemen, no censorship,
            no algorithmic feeds &mdash; just raw signal.
          </p>

          <div className="mt-3 border-t border-[var(--rule-light)] pt-2">
            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
              Coming Soon
            </p>
            <ul className="mt-1 space-y-0.5 font-body-serif text-[11px] text-[var(--ink-light)]">
              <li>&bull; VoIP &amp; free landline calls for members</li>
              <li>&bull; Original editorial content &amp; AI analysis</li>
              <li>&bull; Live discussion rooms</li>
              <li>&bull; BankrBot integration</li>
            </ul>
          </div>

          <div className="mt-3 border-t border-[var(--rule-light)] pt-2">
            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
              Subscribe
            </p>
            <p className="mt-0.5 font-body-serif text-[11px] text-[var(--ink-light)]">
              $50 of <span className="font-mono font-bold">$MO</span> per month for full access.
            </p>
          </div>

          {/* Bottom rule */}
          <div className="mt-3 h-px w-full bg-[var(--rule)]" />
          <div className="mt-px h-[2px] w-full bg-[var(--rule)]" />
          <p className="mt-1 text-center font-mono text-[7px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
            Permissionless &bull; Onchain &bull; Base L2
          </p>
        </div>
      )}
    </div>
  );
}
