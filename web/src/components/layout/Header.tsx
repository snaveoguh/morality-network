"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ChainSwitcher } from "@/components/shared/ChainSwitcher";
import { SearchBar } from "@/components/layout/SearchBar";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { BRAND_NAME } from "@/lib/brand";

/** Core navigation — the workstation menu bar */
const NAV_LINKS = [
  { href: "/", label: "Feed" },
  { href: "/pipe", label: "Pipe" },
  { href: "/markets", label: "Markets" },
  { href: "/bots", label: "Agents" },
  { href: "/sentiment", label: "Index" },
  { href: "/originals", label: "Originals" },
  { href: "/archive", label: "Archive" },
  { href: "/proposals", label: "Governance" },
];

const COOP_PLAYGROUND_LINKS = [
  { href: "/signals", label: "Signals" },
  { href: "/predictions", label: "Predictions" },
  { href: "/predictions/arb", label: "Arb Scanner" },
  { href: "/nouns", label: "Nouns" },
  { href: "/pepe", label: "Pepe" },
  { href: "/music", label: "Music" },
  { href: "/discuss", label: "Discuss" },
  { href: "/registry", label: "Registry" },
  { href: "/vault", label: "Vault" },
  { href: "/terminal", label: "Terminal" },
  { href: "/stumble", label: "Stumble" },
];

export function Header() {
  const pathname = usePathname();
  const isCoopActive =
    pathname === "/coop" ||
    COOP_PLAYGROUND_LINKS.some(({ href }) => pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--ink)] bg-[var(--bg)]">
      {/* Workstation menubar — text-only, hover inverts */}
      <div className="menubar h-[22px]">
        <LogoMenu />
        <span className="text-[var(--rule-soft)] mx-1">|</span>
        <nav className="scrollbar-hide flex min-w-0 items-center overflow-x-auto whitespace-nowrap">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className="menubar-item"
                data-active={isActive ? "true" : undefined}
              >
                {label}
              </Link>
            );
          })}
          <Link
            href="/coop"
            className="menubar-item"
            data-active={isCoopActive ? "true" : undefined}
          >
            Co-op
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-1 pr-1">
          <div className="hidden md:block">
            <SearchBar />
          </div>
          <ThemeToggle />
          <ChainSwitcher />
          <MiniWalletButton />
        </div>
      </div>
    </header>
  );
}

const LOGO_MENU_ITEMS = [
  { href: "/write", label: "Create", desc: "Publish an article" },
  { href: "/subscribe", label: "The Daily Pooter", desc: "Morning brief" },
  { href: "/daily", label: "Daily Editions", desc: "Every front page" },
  { href: "/status", label: "System Status", desc: "Public health dash" },
  { href: "/architecture", label: "Architecture", desc: "System design docs" },
  { href: "/appendix", label: "Appendix", desc: "Contracts & API" },
  { href: "/style-guide", label: "Style Guide", desc: "Brand & design" },
  { href: "/typography", label: "Typography Lab", desc: "Font candidates" },
  { href: "/zk-recovery", label: "ZK Recovery", desc: "Wallet recovery" },
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
        className="menubar-item font-bold"
        aria-label={`${BRAND_NAME} menu`}
        title={BRAND_NAME}
      >
        File
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[999] mt-0 w-56 border border-[var(--ink)] bg-[var(--bg)] shadow-[1px_1px_0_var(--ink)]">
          <div className="border-b border-[var(--ink)] px-2 py-1">
            <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink)]">
              {BRAND_NAME}
            </span>
          </div>
          {LOGO_MENU_ITEMS.map(({ href, label, desc }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="block border-b border-[var(--rule-soft)] px-2 py-1 last:border-b-0 hover:bg-[var(--ink)] hover:text-[var(--bg)]"
            >
              <span className="block text-[12px]">{label}</span>
              <span className="block font-mono text-[9px] opacity-60">{desc}</span>
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
              className="h-4 border border-[var(--ink)] bg-[var(--ink)] px-2 font-mono text-[9px] uppercase tracking-wider text-[var(--bg)] hover:bg-[var(--bg)] hover:text-[var(--ink)]"
            >
              Connect
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button
              type="button"
              onClick={openChainModal}
              className="h-4 border border-[var(--ink)] bg-[var(--bg)] px-2 font-mono text-[9px] uppercase tracking-wider text-[var(--ink)]"
            >
              Wrong Net
            </button>
          );
        }

        return (
          <button
            type="button"
            onClick={openAccountModal}
            className="inline-flex h-4 items-center gap-1 border border-[var(--ink)] bg-[var(--bg)] px-1 font-mono text-[9px] uppercase tracking-wider text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--bg)]"
          >
            {chain.hasIcon && chain.iconUrl ? (
              <span
                className="inline-flex h-2 w-2 overflow-hidden"
                style={{ background: chain.iconBackground }}
              >
                <img alt={chain.name ?? "chain"} src={chain.iconUrl} className="h-2 w-2" />
              </span>
            ) : null}
            <span>{account.displayName}</span>
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
