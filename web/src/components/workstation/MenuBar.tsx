"use client";

/**
 * MenuBar — horizontal text-only menu (Pooter / Document / Edit / Format / View / Tools / Help).
 * Modeled after FrameMaker 1.0 — these are display-only; the click-through
 * behaviors are handled by a popover dropdown for the Pooter root menu.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const MENU_DEFS: { label: string; items?: { label: string; href?: string }[] }[] = [
  {
    label: "Pooter",
    items: [
      { label: "About Pooter World", href: "/about" },
      { label: "Style Guide", href: "/style-guide" },
      { label: "Architecture", href: "/architecture" },
      { label: "Appendix", href: "/appendix" },
      { label: "System Status", href: "/status" },
    ],
  },
  {
    label: "Document",
    items: [
      { label: "Today's Edition", href: "/" },
      { label: "Daily Editions", href: "/daily" },
      { label: "Archive", href: "/archive" },
      { label: "Originals", href: "/originals" },
      { label: "Write", href: "/write" },
    ],
  },
  {
    label: "Edit",
    items: [
      { label: "Subscribe", href: "/subscribe" },
      { label: "Proposals", href: "/proposals" },
      { label: "Coop", href: "/coop" },
    ],
  },
  {
    label: "Format",
    items: [
      { label: "Markets", href: "/markets" },
      { label: "Predictions", href: "/predictions" },
      { label: "Signals", href: "/signals" },
      { label: "Sentiment", href: "/sentiment" },
    ],
  },
  {
    label: "View",
    items: [
      { label: "Pipe", href: "/pipe" },
      { label: "Discuss", href: "/discuss" },
      { label: "Stumble", href: "/stumble" },
      { label: "Registry", href: "/registry" },
    ],
  },
  {
    label: "Tools",
    items: [
      { label: "Agents", href: "/bots" },
      { label: "Vault", href: "/vault" },
      { label: "Nouns", href: "/nouns" },
      { label: "Pepe", href: "/pepe" },
    ],
  },
  { label: "Help", items: [{ label: "Typography Lab", href: "/typography" }] },
];

export function MenuBar() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenIdx(null);
    }
    if (openIdx !== null) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openIdx]);

  return (
    <div ref={ref} className="menubar chrome-menubar relative">
      {MENU_DEFS.map((menu, i) => (
        <div key={menu.label} className="relative">
          <button
            type="button"
            className="menubar-item"
            data-active={openIdx === i ? "true" : undefined}
            onClick={() => setOpenIdx(openIdx === i ? null : i)}
          >
            {menu.label}
          </button>
          {openIdx === i && menu.items ? (
            <div className="palette absolute left-0 top-full z-[999] mt-0 w-56">
              {menu.items.map((item) =>
                item.href ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setOpenIdx(null)}
                    className="block border-b border-[var(--chrome-rule)] px-3 py-1.5 font-chrome text-[var(--chrome-ink)] last:border-b-0 hover:bg-[var(--chrome-ink)] hover:text-[var(--chrome-bg)]"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <div
                    key={item.label}
                    className="block border-b border-[var(--chrome-rule)] px-3 py-1.5 font-chrome text-[var(--chrome-soft)] last:border-b-0"
                  >
                    {item.label}
                  </div>
                ),
              )}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
