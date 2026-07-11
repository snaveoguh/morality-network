"use client";

// Human review gate — operators approve or reject agent-proposed verdicts.
// Approval publishes; rejection returns the claim to the unresolved pool.
// Access: SIWE session address on the operator allowlist (or dev mode).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface QueueItem {
  resolution: {
    id: string;
    verdict: "true" | "false" | "partial" | "unresolved";
    evidence: Array<{ url: string; excerpt: string; kind: string }>;
    reasoning: string;
    resolvedBy: string;
    createdAt: string;
  };
  claim: {
    id: string;
    speakerName: string;
    party: string | null;
    verbatimQuote: string;
    normalizedClaim: string;
    sourceUrl: string;
    utteredAt: string;
    topic: string;
  };
}

const VERDICT_LABEL: Record<string, string> = {
  true: "RESOLVED TRUE",
  false: "RESOLVED FALSE",
  partial: "PARTIALLY TRUE",
  unresolved: "UNRESOLVED",
};

export default function LedgerReviewPage() {
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ledger/review", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `HTTP ${res.status}`);
        setQueue([]);
        return;
      }
      const body = await res.json();
      setQueue(body.queue || []);
      setError(null);
    } catch {
      setError("failed to load queue");
      setQueue([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = useCallback(
    async (resolutionId: string, action: "approve" | "reject") => {
      setBusy(resolutionId);
      try {
        const res = await fetch("/api/ledger/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolutionId, action }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || `HTTP ${res.status}`);
        }
        await load();
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  return (
    <section className="mx-auto max-w-4xl py-8">
      <header className="mb-8 border-b-2 border-[var(--rule)] pb-6">
        <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          <Link href="/ledger" className="transition-colors hover:text-[var(--ink)]">
            &larr; The Ledger
          </Link>
          <span className="text-[var(--rule-light)]">|</span>
          <span>Review Queue</span>
        </div>
        <h1 className="font-headline text-4xl text-[var(--ink)]">
          Verdict Review
        </h1>
        <p className="mt-3 max-w-2xl font-body-serif text-base leading-relaxed text-[var(--ink-light)]">
          Agent-proposed verdicts await human sign-off here. Approval
          publishes; rejection returns the claim to the unresolved pool. No
          negative verdict can publish any other way.
        </p>
      </header>

      {error && (
        <p className="mb-6 border border-[var(--accent-red)] p-3 font-mono text-xs text-[var(--accent-red)]">
          {error}
        </p>
      )}

      {queue === null && (
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--ink-faint)]">
          Loading queue&hellip;
        </p>
      )}

      {queue !== null && queue.length === 0 && !error && (
        <div className="border border-[var(--rule-light)] bg-[var(--paper-dark)]/30 p-8 text-center">
          <p className="font-headline-serif text-xl text-[var(--ink)]">
            The queue is clear.
          </p>
          <p className="mt-2 font-body-serif text-sm italic text-[var(--ink-light)]">
            New proposals arrive when the resolution pass runs.
          </p>
        </div>
      )}

      <ul className="space-y-8">
        {(queue ?? []).map(({ resolution, claim }) => (
          <li key={resolution.id} className="border border-[var(--rule)] p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em]">
              <span
                className={`border px-1.5 py-0.5 font-bold ${
                  resolution.verdict === "false" || resolution.verdict === "partial"
                    ? "border-[var(--accent-red)] text-[var(--accent-red)]"
                    : "border-[var(--ink)] text-[var(--ink)]"
                }`}
              >
                {VERDICT_LABEL[resolution.verdict]}
              </span>
              <span className="text-[var(--ink-light)]">{claim.topic}</span>
              <span className="text-[var(--rule-light)]">|</span>
              <span className="text-[var(--ink-faint)]">{resolution.resolvedBy}</span>
            </div>

            <p className="font-headline-serif text-base font-bold text-[var(--ink)]">
              {claim.speakerName}
              {claim.party ? ` (${claim.party})` : ""} · {claim.utteredAt}
            </p>
            <blockquote className="mt-2 border-l-2 border-[var(--rule)] pl-3 font-body-serif text-sm leading-relaxed text-[var(--ink)]">
              &ldquo;{claim.verbatimQuote}&rdquo;
            </blockquote>
            <p className="mt-1 pl-3 font-body-serif text-xs text-[var(--ink-light)]">
              {claim.normalizedClaim} &middot;{" "}
              <a
                href={claim.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent-red)] underline"
              >
                Hansard
              </a>
            </p>

            <div className="mt-4 border-t border-[var(--rule-light)] pt-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                Agent basis (not published)
              </p>
              <p className="mt-1 font-body-serif text-sm text-[var(--ink-light)]">
                {resolution.reasoning}
              </p>
              <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                Evidence chain
              </p>
              <ul className="mt-1 space-y-1">
                {resolution.evidence.map((e, i) => (
                  <li key={i} className="font-body-serif text-xs text-[var(--ink-light)]">
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent-red)] underline"
                    >
                      [{e.kind}]
                    </a>{" "}
                    {e.excerpt}
                  </li>
                ))}
                {resolution.evidence.length === 0 && (
                  <li className="font-body-serif text-xs italic text-[var(--ink-faint)]">
                    none (unresolved proposals carry no evidence)
                  </li>
                )}
              </ul>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={() => decide(resolution.id, "approve")}
                disabled={busy === resolution.id}
                className="border border-[var(--ink)] px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:opacity-40"
              >
                Approve &amp; publish
              </button>
              <button
                onClick={() => decide(resolution.id, "reject")}
                disabled={busy === resolution.id}
                className="border border-[var(--rule-light)] px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)] transition-colors hover:border-[var(--accent-red)] hover:text-[var(--accent-red)] disabled:opacity-40"
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
