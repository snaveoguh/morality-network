"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useRef, useState, useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ChainSwitcher } from "@/components/shared/ChainSwitcher";
import { SearchBar } from "@/components/layout/SearchBar";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { BRAND_NAME } from "@/lib/brand";

// ============================================================================
// HEADER — Thin all-caps Xerox PARC top band.
//
// Layout.tsx now uses MemoHeader+DocumentExaminer. This file is kept (and
// restyled) so any sub-route that hand-imports <Header /> still works and
// matches the PARC aesthetic.
// ============================================================================

const NAV_LINKS = [
  { href: "/", label: "FEED" },
  { href: "/pipe", label: "PIPE" },
  { href: "/markets", label: "MARKETS" },
  { href: "/bots", label: "AGENTS" },
  { href: "/sentiment", label: "INDEX" },
  { href: "/originals", label: "ORIGINALS" },
  { href: "/archive", label: "ARCHIVE" },
  { href: "/proposals", label: "GOV" },
  { href: "/coop", label: "CO-OP" },
];

const EPOCH = new Date("2026-03-11T00:00:00Z").getTime();

export function Header() {
  const pathname = usePathname() || "/";

  const { edition, isoDate } = useMemo(() => {
    const now = new Date();
    return {
      edition: Math.floor((now.getTime() - EPOCH) / 86_400_000) + 1,
      isoDate: now.toISOString().slice(0, 10),
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--rule)] bg-[var(--paper)]">
      {/* Top vol/issue stripe */}
      <div className="flex h-7 items-center justify-between border-b border-[var(--rule-thin)] px-3 font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-faint)]">
        <div className="flex items-baseline gap-3">
          <LogoMenu />
          <span className="font-bold tracking-[0.26em] text-[var(--ink)]">
            {BRAND_NAME.toUpperCase()}
          </span>
          <span className="hidden sm:inline">VOL. 1</span>
          <span className="hidden sm:inline">NO. {edition}</span>
          <span className="hidden md:inline">EDITION {isoDate}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden md:block">
            <SearchBar />
          </div>
          <ThemeToggle />
          <ChainSwitcher />
          <MiniWalletButton />
        </div>
      </div>

      {/* Nav row — pipe-separated all caps */}
      <nav className="scrollbar-hide flex items-center gap-0 overflow-x-auto whitespace-nowrap px-3 py-1.5">
        {NAV_LINKS.map(({ href, label }, i) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <span key={href} className="flex items-center">
              {i > 0 && (
                <span className="mx-2 text-[var(--rule-thin)]">|</span>
              )}
              <Link
                href={href}
                className={`font-mono text-[10px] uppercase tracking-[0.2em] transition-colors ${
                  isActive
                    ? "font-bold text-[var(--ink)] underline underline-offset-2 decoration-[1px] decoration-[var(--rule)]"
                    : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                }`}
              >
                {label}
              </Link>
            </span>
          );
        })}
      </nav>
    </header>
  );
}

const LOGO_MENU_ITEMS = [
  { href: "/write", label: "Create", desc: "Publish an article" },
  { href: "/subscribe", label: "The Daily Pooter", desc: "Morning intelligence brief" },
  { href: "/daily", label: "Daily Editions", desc: "Every front page, archived" },
  { href: "/status", label: "System Status", desc: "Public health dashboard" },
  { href: "/architecture", label: "Architecture", desc: "System design docs" },
  { href: "/appendix", label: "Appendix", desc: "Contracts & API reference" },
  { href: "/style-guide", label: "Style Guide", desc: "Brand & design system" },
  { href: "/typography", label: "Typography Lab", desc: "Variable-font candidates" },
  { href: "/zk-recovery", label: "ZK Recovery", desc: "Passwordless wallet recovery" },
];

function LogoMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-4 w-4 items-center justify-center border border-[var(--rule)] transition-opacity hover:opacity-70"
        aria-label={`${BRAND_NAME} menu`}
        title={BRAND_NAME}
      >
        <span className="block h-2 w-2 bg-[var(--ink)]" aria-hidden />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[999] mt-1 w-56 border border-[var(--rule)] bg-[var(--paper)]">
          <div className="border-b border-[var(--rule)] px-2 py-1.5">
            <span className="font-mono text-[8px] font-bold uppercase tracking-[0.22em] text-[var(--ink)]">
              {BRAND_NAME.toUpperCase()}
            </span>
          </div>
          {LOGO_MENU_ITEMS.map(({ href, label, desc }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="block border-b border-[var(--rule-thin)] px-2 py-1.5 last:border-b-0 hover:bg-[var(--paper-tint)]"
            >
              <span className="block text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--ink)]">
                {label}
              </span>
              <span className="block font-mono text-[8px] tracking-[0.12em] text-[var(--ink-faint)]">
                {desc}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniWalletButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === "authenticated");

        if (!connected) {
          return (
            <button
              type="button"
              onClick={openConnectModal}
              className="h-5 border border-[var(--rule)] bg-[var(--ink)] px-2 font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--paper)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]"
            >
              AFFIX SIGNATURE
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button
              type="button"
              onClick={openChainModal}
              className="h-5 border border-[var(--ink)] bg-[var(--paper)] px-2 font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--ink)]"
            >
              WRONG NET
            </button>
          );
        }

        return (
          <button
            type="button"
            onClick={openAccountModal}
            className="inline-flex h-5 items-center gap-1 border border-[var(--rule)] bg-[var(--paper)] px-1.5 font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--ink)] transition-colors hover:bg-[var(--paper-tint)]"
          >
            {chain.hasIcon && chain.iconUrl ? (
              <span
                className="inline-flex h-2 w-2 overflow-hidden"
                style={{ background: chain.iconBackground }}
              >
                <img
                  alt={chain.name ?? "chain"}
                  src={chain.iconUrl}
                  className="h-2 w-2"
                />
              </span>
            ) : null}
            <span>{account.displayName}</span>
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
