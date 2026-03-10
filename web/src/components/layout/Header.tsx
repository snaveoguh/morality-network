"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const NAV_LINKS = [
  { href: "/", label: "Feed" },
  { href: "/stumble", label: "Stumble" },
  { href: "/markets", label: "Markets" },
  { href: "/archive", label: "Archive" },
  { href: "/proposals", label: "Proposals" },
  { href: "/predictions", label: "Predictions" },
  { href: "/discuss", label: "Discuss" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/bots", label: "Bots" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--rule)] bg-[var(--paper)]">
      <div className="mx-auto flex h-9 max-w-7xl items-center justify-between px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/"
            className="flex h-4 w-4 shrink-0 items-center justify-center"
            aria-label="pooter world home"
            title="pooter world"
          >
            <img
              src="https://morality.s3.eu-west-2.amazonaws.com/brand/glyph.png"
              alt=""
              className="h-4 w-4 object-contain grayscale contrast-200 brightness-0"
            />
          </Link>

          <nav className="flex min-w-0 items-center gap-0 overflow-x-auto whitespace-nowrap">
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

          <span className="hidden text-[var(--rule-light)] lg:inline">|</span>
          <p className="hidden max-w-[24rem] truncate font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--ink-faint)] lg:block">
            A public ledger of world events and their interpretation.
          </p>
        </div>

        <MiniWalletButton />
      </div>
    </header>
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
