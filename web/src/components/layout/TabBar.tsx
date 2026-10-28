"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FeedIcon,
  LedgerIcon,
  MoreIcon,
  SearchIcon,
  SignalsIcon,
} from "@/components/layout/icons";

// Phone + tablet bottom tab bar: Feed / Search / Ledger / Signals / More.
// Hidden at ≥1024, where the header carries search and the Menu link.
// "Signals" is the Bearometer (buy / hold / sell signals) at /signals.

const TABS = [
  { href: "/", label: "Feed", Icon: FeedIcon },
  { href: "/search", label: "Search", Icon: SearchIcon },
  { href: "/ledger", label: "Ledger", Icon: LedgerIcon },
  { href: "/signals", label: "Signals", Icon: SignalsIcon },
  { href: "/more", label: "More", Icon: MoreIcon },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--rule)] bg-[var(--paper)] pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="mx-auto grid h-[68px] max-w-3xl grid-cols-5">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-[5px] text-[11px] font-semibold transition-colors ${
                active ? "text-[var(--ink)]" : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              <Icon className="h-[22px] w-[22px]" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
