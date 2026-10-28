"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND_NAME } from "@/lib/brand";
import { MissionStatement } from "@/components/layout/MissionStatement";
import { SearchIcon } from "@/components/layout/icons";

// ============================================================================
// HEADER — direction C slim bar
//
//   phone   [pw]        pooter world        [search]
//   ≥1024   [pw]        pooter world   [ search… ] [Menu]
//
// The big nav lives in /more (the More tab on phone, "Menu" on desktop).
// The tagline sits under the bar on the front page only; inner pages keep
// the bar slim.
// ============================================================================

/** The blackletter "pw" mark — paper square, ink letters. */
export function PwMark({ size = "sm" }: { size?: "sm" | "lg" }) {
  const box = size === "lg" ? "h-10 w-10 text-[24px]" : "h-8 w-8 text-[19px]";
  return (
    <span
      aria-hidden
      className={`blackletter flex shrink-0 items-center justify-center bg-[var(--ink)] pb-[3px] leading-none text-[var(--paper)] ${box}`}
    >
      pw
    </span>
  );
}

export function Header() {
  const pathname = usePathname();
  const isFront = pathname === "/";

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-[var(--rule-light)] bg-[var(--paper)]">
        <div className="mx-auto grid h-[60px] max-w-7xl grid-cols-[44px_1fr_44px] items-center px-4 lg:h-[72px] lg:grid-cols-3">
          <Link
            href="/"
            aria-label={`${BRAND_NAME} home`}
            className="flex h-11 w-11 items-center"
          >
            <PwMark />
          </Link>

          <Link
            href="/"
            className="blackletter flex h-11 items-center justify-center truncate text-center text-[28px] leading-none text-[var(--ink)] sm:text-[32px] lg:text-[40px]"
          >
            {BRAND_NAME}
          </Link>

          {/* Phone + tablet: icon to the search page */}
          <Link
            href="/search"
            aria-label="Search"
            className="flex h-11 w-11 items-center justify-center justify-self-end text-[var(--ink)] lg:hidden"
          >
            <SearchIcon className="h-[22px] w-[22px]" />
          </Link>

          {/* Desktop: inline search box + Menu */}
          <div className="hidden items-center justify-end gap-2.5 lg:flex">
            <form action="/search" method="get" role="search" className="w-[220px]">
              <label className="flex h-11 items-center gap-2 border border-[var(--rule)] px-3">
                <SearchIcon className="h-4 w-4 shrink-0 text-[var(--ink)]" />
                <input
                  type="search"
                  name="q"
                  placeholder="Search"
                  aria-label="Search"
                  className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
                />
              </label>
            </form>
            <Link
              href="/more"
              className={`flex h-11 items-center border px-4 text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--paper-dark)] ${
                pathname === "/more" ? "border-[var(--ink)]" : "border-[var(--rule)]"
              }`}
            >
              Menu
            </Link>
          </div>
        </div>
      </header>
      {isFront && <MissionStatement />}
    </>
  );
}
