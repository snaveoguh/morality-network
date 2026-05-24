"use client";

// ============================================================================
// MemoFooter — academic-paper metadata strip + page nav + sigils.
// Footnote-style command line, AFFIX SIGNATURE wallet link, REVERSE VIDEO,
// REQUEST SUBSCRIPTION, page number.
// ============================================================================

import Link from "next/link";
import { useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTheme } from "@/lib/theme";

const EPOCH = new Date("2026-03-11T00:00:00Z").getTime();

export function MemoFooter() {
  const { dateStr, edition, isoDate, filedTime } = useMemo(() => {
    const now = new Date();
    const e = Math.floor((now.getTime() - EPOCH) / 86_400_000) + 1;
    const ds = now
      .toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      })
      .toUpperCase();
    const iso = now.toISOString().slice(0, 10);
    const ft = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Denver",
    });
    return { dateStr: ds, edition: e, isoDate: iso, filedTime: ft };
  }, []);

  const { theme, toggle } = useTheme();
  const [cmd, setCmd] = useState("");

  function runCmd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = cmd.trim();
    if (!trimmed) return;
    // simple in-page commands
    if (trimmed === "ls" || trimmed === "dir") {
      window.location.assign("/");
      return;
    }
    if (trimmed.startsWith("cd ") || trimmed.startsWith("open ")) {
      const route = "/" + trimmed.split(/\s+/)[1].replace(/^\//, "");
      window.location.assign(route);
      return;
    }
    if (trimmed === "invert" || trimmed === "reverse") {
      toggle();
      setCmd("");
      return;
    }
    // fall back to search
    window.location.assign(`/?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <footer className="mt-6 border-t border-[var(--rule)] bg-[var(--paper)]">
      {/* Cmdline */}
      <form onSubmit={runCmd} className="cmdline">
        <input
          type="text"
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          placeholder="type a command — `ls`, `cd markets`, `invert`, or a query"
          className="flex-1 bg-transparent font-mono text-[11px] text-[var(--ink)] placeholder-[var(--ink-faint)] focus:outline-none"
          aria-label="Command line"
        />
      </form>

      {/* Metadata strip */}
      <div className="border-t border-[var(--rule-thin)] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-bold tracking-[0.22em] text-[var(--ink)]">
              POOTER.WORLD
            </span>
            <span>VOL. 1</span>
            <span>NO. {edition}</span>
            <span>EDITION {isoDate}</span>
            <span>FILED {filedTime} MST</span>
            <span>{dateStr}</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <button
              type="button"
              onClick={toggle}
              className="hover:text-[var(--ink)]"
              title="Invert paper / ink"
            >
              [{theme === "dark" ? "RESTORE PAPER" : "REVERSE VIDEO"}]
            </button>
            <Link href="/subscribe" className="hover:text-[var(--ink)]">
              [REQUEST SUBSCRIPTION]
            </Link>
            <AffixSignature />
            <span className="text-[var(--ink)]">PAGE 1 OF MANY</span>
          </div>
        </div>
      </div>

      {/* Colophon */}
      <div className="border-t border-[var(--rule-thin)] px-3 py-2 text-center font-mono text-[8px] uppercase tracking-[0.24em] text-[var(--ink-faint)]">
        <span>SET IN HELVETICA ON A XEROX ALTO &middot; FILED VIA THE MORALITY NETWORK</span>
      </div>
    </footer>
  );
}

function AffixSignature() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openConnectModal, mounted, authenticationStatus }) => {
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
              className="hover:text-[var(--ink)]"
            >
              [AFFIX SIGNATURE]
            </button>
          );
        }
        return (
          <button
            type="button"
            onClick={openAccountModal}
            className="hover:text-[var(--ink)]"
            title="Signed: change wallet"
          >
            [SIGNED {account.displayName.toUpperCase()}]
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
