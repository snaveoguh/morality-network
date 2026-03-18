"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { EntityMention } from "@/lib/types/entities";
import { computeEntityHash, buildEntityUrl } from "@/lib/entity";

interface EntityPopoverProps {
  entity: EntityMention;
  children: React.ReactNode;
}

const TYPE_BADGES: Record<EntityMention["type"], { label: string; color: string }> = {
  person: { label: "Person", color: "var(--ink)" },
  organization: { label: "Org", color: "var(--accent-red)" },
  country: { label: "Country", color: "var(--ink-light)" },
  place: { label: "Place", color: "var(--ink-faint)" },
};

export function EntityPopover({ entity, children }: EntityPopoverProps) {
  const [show, setShow] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  function handleEnter() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setShow(true), 300);
  }

  function handleLeave() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setShow(false), 200);
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const badge = TYPE_BADGES[entity.type];
  const entityHash = computeEntityHash(entity.canonicalName);

  return (
    <span
      className="relative inline"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <span className="cursor-help border-b border-dotted border-[var(--rule)] transition-colors hover:border-[var(--ink)]">
        {children}
      </span>

      {show && (
        <div
          ref={popoverRef}
          className="absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 border-2 border-[var(--rule)] bg-[var(--paper)] p-3 shadow-lg"
          onMouseEnter={() => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
          }}
          onMouseLeave={handleLeave}
        >
          {/* Top rule */}
          <div className="mb-1.5 h-px w-full bg-[var(--rule)]" />

          {/* Name + type badge */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-headline text-sm font-bold text-[var(--ink)]">
              {entity.name}
            </span>
            <span
              className="shrink-0 border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider"
              style={{
                borderColor: badge.color,
                color: badge.color,
              }}
            >
              {badge.label}
            </span>
          </div>

          {/* Context */}
          {entity.context && (
            <p className="mt-1.5 font-body-serif text-[11px] leading-relaxed text-[var(--ink-light)]">
              {entity.context}
            </p>
          )}

          {/* Bias note */}
          {entity.biasContext && (
            <p className="mt-1.5 border-t border-[var(--rule-light)] pt-1.5 font-mono text-[9px] text-[var(--ink-faint)]">
              <span className="font-bold uppercase tracking-wider">Bias:</span>{" "}
              {entity.biasContext.length > 80
                ? entity.biasContext.slice(0, 77) + "..."
                : entity.biasContext}
            </p>
          )}

          {/* Mentions count */}
          <p className="mt-1.5 font-mono text-[8px] text-[var(--ink-faint)]">
            Mentioned {entity.occurrences.length} time
            {entity.occurrences.length !== 1 ? "s" : ""} in this article
          </p>

          {/* Entity profile link */}
          <div className="mt-2 border-t border-[var(--rule-light)] pt-2">
            <Link
              href={buildEntityUrl(entityHash, { url: entity.canonicalName, title: entity.name, source: "article-mention", type: entity.type })}
              className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
            >
              View Entity Profile &rarr;
            </Link>
          </div>

          {/* Bottom rule */}
          <div className="mt-1.5 h-px w-full bg-[var(--rule)]" />
        </div>
      )}
    </span>
  );
}
