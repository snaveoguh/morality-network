"use client";

// Human review gate — operators approve or reject agent-proposed verdicts,
// and can propose verdicts themselves for claims the agent does not cover.
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

const VERDICTS = ["true", "false", "partial", "unresolved"] as const;
const EVIDENCE_KINDS = ["division", "ons", "hansard", "obr", "other"] as const;

interface EvidenceDraft {
  url: string;
  excerpt: string;
  kind: string;
}

const EMPTY_EVIDENCE: EvidenceDraft = { url: "", excerpt: "", kind: "other" };

const FIELD_CLASS =
  "w-full border border-[var(--rule-light)] bg-transparent px-2 py-1.5 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--ink)] focus:outline-none";
const LABEL_CLASS =
  "mb-1 block font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]";

// Operator tool: propose a verdict for any claim directly. The proposal
// enters the queue above and still publishes only through approval.
function ProposeVerdict({ onProposed }: { onProposed: () => Promise<void> }) {
  const [claimId, setClaimId] = useState("");
  const [verdict, setVerdict] = useState<string>("true");
  const [reasoning, setReasoning] = useState("");
  const [evidence, setEvidence] = useState<EvidenceDraft[]>([EMPTY_EVIDENCE]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const setRow = (i: number, patch: Partial<EvidenceDraft>) =>
    setEvidence((rows) =>
      rows.map((row, j) => (j === i ? { ...row, ...patch } : row)),
    );

  const submit = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/ledger/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "propose",
          claimId: claimId.trim(),
          verdict,
          reasoning,
          // Rows left fully blank are omitted, not rejected.
          evidence: evidence.filter((e) => e.url.trim() || e.excerpt.trim()),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(body.error || `HTTP ${res.status}`);
        return;
      }
      setClaimId("");
      setReasoning("");
      setEvidence([EMPTY_EVIDENCE]);
      setNotice(`queued for review: ${body.resolutionId}`);
      await onProposed();
    } catch {
      setNotice("failed to submit proposal");
    } finally {
      setBusy(false);
    }
  }, [claimId, verdict, reasoning, evidence, onProposed]);

  return (
    <section className="mt-12 border-t-2 border-[var(--rule)] pt-8">
      <h2 className="font-headline text-2xl text-[var(--ink)]">
        Propose a verdict
      </h2>
      <p className="mt-2 max-w-2xl font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
        For claims outside the agent&rsquo;s coverage (policy outcomes,
        spending). The proposal joins the queue above and publishes only on
        approval. Every verdict except unresolved needs a document chain.
      </p>

      <div className="mt-5 space-y-4 border border-[var(--rule)] p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <label className={LABEL_CLASS} htmlFor="propose-claim-id">
              Claim id (32 hex)
            </label>
            <input
              id="propose-claim-id"
              value={claimId}
              onChange={(e) => setClaimId(e.target.value)}
              placeholder="e.g. 3f2a…"
              className={FIELD_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor="propose-verdict">
              Verdict
            </label>
            <select
              id="propose-verdict"
              value={verdict}
              onChange={(e) => setVerdict(e.target.value)}
              className={FIELD_CLASS}
            >
              {VERDICTS.map((v) => (
                <option key={v} value={v}>
                  {VERDICT_LABEL[v]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="propose-reasoning">
            Basis for the reviewer (20&ndash;1200 chars)
          </label>
          <textarea
            id="propose-reasoning"
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value)}
            rows={3}
            placeholder="What the records show, stated plainly."
            className={FIELD_CLASS}
          />
        </div>

        <div>
          <p className={LABEL_CLASS}>Evidence chain (https sources)</p>
          <div className="space-y-2">
            {evidence.map((row, i) => (
              <div
                key={i}
                className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]"
              >
                <input
                  value={row.url}
                  onChange={(e) => setRow(i, { url: e.target.value })}
                  placeholder="https://…"
                  aria-label={`evidence ${i + 1} url`}
                  className={FIELD_CLASS}
                />
                <input
                  value={row.excerpt}
                  onChange={(e) => setRow(i, { excerpt: e.target.value })}
                  placeholder="what the record shows (10-600 chars)"
                  aria-label={`evidence ${i + 1} excerpt`}
                  className={FIELD_CLASS}
                />
                <select
                  value={row.kind}
                  onChange={(e) => setRow(i, { kind: e.target.value })}
                  aria-label={`evidence ${i + 1} kind`}
                  className={FIELD_CLASS}
                >
                  {EVIDENCE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() =>
                    setEvidence((rows) => rows.filter((_, j) => j !== i))
                  }
                  disabled={evidence.length === 1}
                  className="border border-[var(--rule-light)] px-2 font-mono text-[10px] uppercase text-[var(--ink-faint)] transition-colors hover:border-[var(--accent-red)] hover:text-[var(--accent-red)] disabled:opacity-40"
                  aria-label={`remove evidence ${i + 1}`}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
          {evidence.length < 3 && (
            <button
              onClick={() => setEvidence((rows) => [...rows, EMPTY_EVIDENCE])}
              className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
            >
              + add evidence row
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="border border-[var(--ink)] px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:opacity-40"
          >
            Submit proposal
          </button>
          {notice && (
            <span className="font-mono text-[10px] text-[var(--ink-light)]">
              {notice}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

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
          Proposed verdicts (agent and human alike) await sign-off here. Approval
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
                Proposer&rsquo;s basis (not published)
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

      <ProposeVerdict onProposed={load} />
    </section>
  );
}
