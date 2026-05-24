"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

export interface MenuBarItem {
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
}

interface MenuBarProps {
  items: MenuBarItem[];
  trailing?: ReactNode;
  className?: string;
}

/**
 * Workstation-style menubar — text-only, no icons, hover inverts.
 * Used as the top of a Window or as the global page-level menu.
 */
export function MenuBar({ items, trailing, className = "" }: MenuBarProps) {
  const pathname = usePathname();
  return (
    <div className={`menubar ${className}`}>
      {items.map((it) => {
        const isActive =
          it.active ??
          (it.href ? (it.href === "/" ? pathname === "/" : pathname.startsWith(it.href)) : false);
        const content = (
          <span data-active={isActive ? "true" : undefined} className="menubar-item">
            {it.label}
          </span>
        );
        if (it.href) {
          return (
            <Link key={it.label} href={it.href} className="contents">
              {content}
            </Link>
          );
        }
        return (
          <button key={it.label} type="button" onClick={it.onClick} className="contents">
            {content}
          </button>
        );
      })}
      {trailing && <div className="ml-auto flex items-center gap-1">{trailing}</div>}
    </div>
  );
}
