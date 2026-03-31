"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ChainSwitcher } from "@/components/shared/ChainSwitcher";
import { SearchBar } from "@/components/layout/SearchBar";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { BRAND_NAME } from "@/lib/brand";

const NAV_LINKS = [
  { href: "/", label: "Feed" },
  { href: "/stumble", label: "Stumble" },
  { href: "/markets", label: "Markets" },
  { href: "/signals", label: "Signals" },
  { href: "/sentiment", label: "Index" },
  { href: "/archive", label: "Archive" },
  { href: "/proposals", label: "Governance" },
  { href: "/predictions", label: "Predictions" },
  { href: "/pepe", label: "Pepe" },
  { href: "/nouns", label: "Nouns" },
  { href: "/music", label: "Music" },
  { href: "/discuss", label: "Discuss" },
  { href: "/registry", label: "Registry" },
  { href: "/vault", label: "Vault" },
  { href: "/bots", label: "Agents" },
  { href: "/architecture", label: "Architecture" },
  { href: "/appendix", label: "Appendix" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--rule)] bg-[var(--paper)]">
      <div className="mx-auto flex h-9 max-w-7xl items-center justify-between px-4">
        <div className="flex min-w-0 items-center gap-2">
          <LogoMenu />

          <nav className="scrollbar-hide flex min-w-0 items-center gap-0 overflow-x-auto whitespace-nowrap">
            {NAV_LINKS.map(({ href, label }, i) => {
              const isActive =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <span key={href} className="flex items-center">
                  {i > 0 && <span className="mx-2 text-[var(--rule-light)]">|</span>}
                  <Link
                    href={href}
                    className={`font-mono text-[9px] uppercase tracking-[0.16em] transition-colors ${
                      isActive
                        ? "font-bold text-[var(--ink)] underline underline-offset-4 decoration-[1px] decoration-[var(--rule)]"
                        : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {label}
                  </Link>
                </span>
              );
            })}
          </nav>

        </div>

        <div className="flex items-center gap-1.5">
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
  { href: "/style-guide", label: "Style Guide", desc: "Brand & design system" },
  { href: "/zk-recovery", label: "ZK Recovery", desc: "Passwordless wallet recovery" },
  { href: "/subscribe", label: "The Daily Pooter", desc: "Morning intelligence brief" },
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
        className="flex h-4 w-4 items-center justify-center transition-opacity hover:opacity-70"
        aria-label={`${BRAND_NAME} menu`}
        title={BRAND_NAME}
      >
        <img
          src="https://morality.s3.eu-west-2.amazonaws.com/brand/glyph.png"
          alt=""
          className="h-4 w-4 object-contain header-glyph"
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[999] mt-2 w-52 border border-[var(--rule)] bg-[var(--paper)] shadow-lg">
          <div className="border-b border-[var(--rule)] px-3 py-2">
            <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
              {BRAND_NAME}
            </span>
          </div>
          {LOGO_MENU_ITEMS.map(({ href, label, desc }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="block border-b border-[var(--rule-light)] px-3 py-2 transition-colors last:border-b-0 hover:bg-[var(--paper-dark)]"
            >
              <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink)]">
                {label}
              </span>
              <span className="block font-mono text-[8px] tracking-[0.1em] text-[var(--ink-faint)]">
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
              className="h-5 border border-[var(--rule)] bg-[var(--ink)] px-2 font-mono text-[7px] uppercase tracking-[0.12em] text-[var(--paper)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]"
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
              className="h-5 border border-[var(--accent-red)] bg-[var(--paper)] px-2 font-mono text-[7px] uppercase tracking-[0.12em] text-[var(--accent-red)] transition-colors hover:bg-[var(--accent-red)] hover:text-[var(--paper)]"
            >
              Wrong Net
            </button>
          );
        }

        return (
          <button
            type="button"
            onClick={openAccountModal}
            className="inline-flex h-5 items-center gap-1 border border-[var(--rule)] bg-[var(--paper)] px-1.5 font-mono text-[7px] uppercase tracking-[0.12em] text-[var(--ink)] transition-colors hover:bg-[var(--paper-dark)]"
          >
            {chain.hasIcon && chain.iconUrl ? (
              <span
                className="inline-flex h-2 w-2 overflow-hidden rounded-full"
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
