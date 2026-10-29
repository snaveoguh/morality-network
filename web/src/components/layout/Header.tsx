"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BRAND_NAME } from "@/lib/brand";
import { CloseIcon, SearchIcon } from "@/components/layout/icons";

// ============================================================================
// HEADER — direction C slim bar
//
//   phone   [pw]   Accountability record    [search]
//   ≥1024   [pw]   Accountability record   [ search… ] [Menu]
//
// The big nav lives in /more (the More tab on phone, "Menu" on desktop).
// On /search and /more the right-hand control becomes Close, which returns
// to the page they were opened from (or the front page on a direct visit).
// ============================================================================

const OVERLAY_PATHS = new Set(["/search", "/more"]);

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
  const router = useRouter();
  const overlay = OVERLAY_PATHS.has(pathname);

  // Remember whether we arrived here by navigating inside the site, so Close
  // can go back (keeping scroll position) rather than reloading the front.
  const lastPath = useRef<string | null>(null);
  const cameFrom = useRef<string | null>(null);
  useEffect(() => {
    if (lastPath.current !== pathname) {
      cameFrom.current = lastPath.current;
      lastPath.current = pathname;
    }
  }, [pathname]);
  const close = () => {
    if (cameFrom.current && !OVERLAY_PATHS.has(cameFrom.current)) router.back();
    else router.push("/");
  };

  const closeButton = (
    <button
      type="button"
      onClick={close}
      aria-label="Close"
      className="flex h-11 items-center justify-center gap-1.5 justify-self-end text-sm font-semibold text-[var(--ink)] max-lg:w-11 lg:border lg:border-[var(--rule)] lg:px-4 lg:transition-colors lg:hover:bg-[var(--paper-dark)]"
    >
      <CloseIcon className="h-[22px] w-[22px] lg:h-4 lg:w-4" />
      <span className="hidden lg:inline">Close</span>
    </button>
  );

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-[var(--rule-light)] bg-[var(--paper)]">
        <div className="mx-auto grid h-[56px] max-w-7xl grid-cols-[44px_1fr_44px] items-center px-4 lg:h-[64px] lg:grid-cols-3">
          <Link
            href="/"
            aria-label={`${BRAND_NAME} home`}
            className="flex h-11 w-11 items-center"
          >
            <PwMark />
          </Link>

          {/* No wordmark: the pw glyph is the brand; the tagline sits centre. */}
          <Link
            href="/"
            className="font-news flex h-11 items-center justify-center truncate text-center text-[17px] tracking-[0.04em] text-[var(--ink)] lg:text-[19px]"
          >
            Accountability record
          </Link>

          {overlay ? (
            <div className="flex justify-end">{closeButton}</div>
          ) : (
            <>
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
                  className="flex h-11 items-center border border-[var(--rule)] px-4 text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--paper-dark)]"
                >
                  Menu
                </Link>
              </div>
            </>
          )}
        </div>
      </header>
    </>
  );
}
