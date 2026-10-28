"use client";

// "Cite this" for one MP Record stat: shows the citation string
// (MP_RECORD_SPEC §7) and copies it.

import { useState } from "react";

export function CiteThis({ citation, permalink }: { citation: string; permalink: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!citation) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(citation);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent-red)] underline decoration-1 underline-offset-2"
      >
        Cite this
      </button>
      {open && (
        <div className="mt-2 border border-[var(--rule-light)] p-3">
          <p className="select-all break-words font-body-serif text-sm leading-relaxed text-[var(--ink)]">{citation}</p>
          <div className="mt-2 flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-[0.2em]">
            <button type="button" onClick={copy} className="text-[var(--accent-red)] underline decoration-1 underline-offset-2">
              {copied ? "Copied" : "Copy"}
            </button>
            <a href={permalink} className="text-[var(--accent-red)] underline decoration-1 underline-offset-2">
              Permalink
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
