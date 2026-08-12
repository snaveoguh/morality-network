"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * The reviewer's queue.
 *
 * Shows only this reviewer's own assignments. Nothing here reveals how anyone
 * else voted — the round is blind until it settles, and a reviewer who could
 * see a peer's vote would anchor on it.
 */

interface Evidence {
  url: string;
  excerpt: string;
  kind: string;
}

interface Assignment {
  assignmentId: string;
  roundId: string;
  claimId: string;
  verdict: string;
  speakerName: string;
  party: string | null;
  verbatimQuote: string;
  normalizedClaim: string;
  reasoning: string;
  evidence: Evidence[];
  sourceUrl: string;
  stakeMo: string;
  rewardMo: string;
  state: string;
  expiresAt: string;
}

const VERDICT_LABEL: Record<string, string> = {
  true: "Resolved true",
  false: "Resolved false",
  partial: "Partially true",
  unresolved: "Unresolved",
};

const mo = (v: string) => Number.parseFloat(v).toLocaleString("en-GB", { maximumFractionDigits: 0 });

export function ReviewQueue() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { basis: string; evidenceIndex: number | null }>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/review/assignments");
      if (!res.ok) throw new Error("Could not load your queue");
      const body = await res.json();
      setAssignments(body.assignments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setAssignments([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const accept = useCallback(
    async (a: Assignment) => {
      setBusy(a.assignmentId);
      setError("");
      try {
        const res = await fetch("/api/review/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignmentId: a.assignmentId }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? "Could not accept");
        await load();
        // The balance in the page header is server-rendered; without this it
        // would keep showing the pre-stake figure.
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setBusy(null);
      }
    },
    [load, router],
  );

  const vote = useCallback(
    async (a: Assignment, choice: "approve" | "reject" | "more_evidence") => {
      const draft = drafts[a.assignmentId] ?? { basis: "", evidenceIndex: null };
      setBusy(a.assignmentId);
      setError("");
      setNotice("");
      try {
        const res = await fetch("/api/review/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignmentId: a.assignmentId,
            vote: choice,
            basis: draft.basis,
            evidenceIndex: draft.evidenceIndex,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? "Could not record your vote");
        setNotice(
          body.settled
            ? "Vote recorded — that was the last one, so the round has settled."
            : "Vote recorded. You'll see the outcome once the other reviewers have voted.",
        );
        await load();
        // Balance, review count and agreement rate all move on a settled vote.
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setBusy(null);
      }
    },
    [drafts, load, router],
  );

  if (assignments === null) {
    return <p className="mt-6 text-sm text-[var(--ink-faint)]">Loading your queue…</p>;
  }

  if (assignments.length === 0) {
    return (
      <div className="mt-6 space-y-4">
        {/* Voting on the last item empties the queue — without this the
            confirmation would vanish and the reviewer would not know their
            vote landed. */}
        {notice && (
          <p className="border-l-4 border-[var(--ink)] bg-[var(--paper-tint)] py-3 pl-4 text-sm">
            {notice}
          </p>
        )}
        <div className="border-2 border-[var(--ink)] bg-[var(--paper-tint)] p-6">
          <p className="font-headline text-lg leading-tight">Nothing assigned right now</p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--ink-light)]">
            Assignments are handed out at random — you can&apos;t pick your own claims, because
            then anyone with an interest could review their own side.
          </p>
          {error && <p className="mt-3 text-sm text-[var(--accent-red)]">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-8">
      {notice && (
        <p className="border-l-4 border-[var(--ink)] bg-[var(--paper-tint)] py-3 pl-4 text-sm">
          {notice}
        </p>
      )}
      {error && <p className="text-sm text-[var(--accent-red)]">{error}</p>}

      {assignments.map((a) => {
        const draft = drafts[a.assignmentId] ?? { basis: "", evidenceIndex: null };
        const setDraft = (patch: Partial<typeof draft>) =>
          setDrafts((d) => ({ ...d, [a.assignmentId]: { ...draft, ...patch } }));
        const isBusy = busy === a.assignmentId;

        return (
          <article key={a.assignmentId} className="border-2 border-[var(--ink)] bg-[var(--paper-tint)] p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--accent-red)]">
                Proposed: {VERDICT_LABEL[a.verdict] ?? a.verdict}
              </p>
              <p className="text-xs text-[var(--ink-faint)]">
                stake {mo(a.stakeMo)} MO · reward {mo(a.rewardMo)} MO
              </p>
            </div>

            <p className="mt-3 text-sm text-[var(--ink-faint)]">
              {a.speakerName}
              {a.party ? ` · ${a.party}` : ""}
            </p>

            <blockquote className="mt-2 border-l-4 border-[var(--ink)] pl-4 text-lg leading-snug">
              &ldquo;{a.verbatimQuote}&rdquo;
            </blockquote>

            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                  Restated
                </dt>
                <dd className="mt-0.5 leading-relaxed">{a.normalizedClaim}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                  The agent&apos;s reasoning
                </dt>
                <dd className="mt-0.5 leading-relaxed text-[var(--ink-light)]">{a.reasoning}</dd>
              </div>
            </dl>

            <div className="mt-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                Evidence — pick the one that settles it
              </p>
              <ul className="mt-2 space-y-2">
                {a.evidence.map((e, i) => (
                  <li key={`${a.assignmentId}-${i}`}>
                    <label className="flex cursor-pointer items-start gap-3 border border-[var(--rule-light)] p-3 text-sm">
                      <input
                        type="radio"
                        name={`evidence-${a.assignmentId}`}
                        checked={draft.evidenceIndex === i}
                        onChange={() => setDraft({ evidenceIndex: i })}
                        disabled={a.state !== "accepted"}
                        className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent-red)]"
                      />
                      <span>
                        <span className="block leading-relaxed">{e.excerpt}</span>
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 block font-mono text-xs break-all text-[var(--ink-faint)] underline underline-offset-2"
                        >
                          {e.kind} · {e.url}
                        </a>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <a
                href={a.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-[var(--ink-faint)] underline underline-offset-4"
              >
                Read the original in Hansard
              </a>
            </div>

            {a.state === "assigned" ? (
              <div className="mt-5">
                <p className="max-w-xl text-sm leading-relaxed text-[var(--ink-light)]">
                  Accepting locks {mo(a.stakeMo)} MO. You get it back either way — including if
                  you disagree with the others. It is only lost if you approve something that
                  is later overturned.
                </p>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => accept(a)}
                  className="mt-3 bg-[var(--ink)] px-6 py-3 text-xs uppercase tracking-[0.16em] text-[var(--paper)] transition-opacity hover:opacity-80 disabled:opacity-40"
                >
                  {isBusy ? "Staking…" : `Accept and stake ${mo(a.stakeMo)} MO`}
                </button>
              </div>
            ) : (
              <div className="mt-5">
                <label
                  htmlFor={`basis-${a.assignmentId}`}
                  className="block text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)]"
                >
                  What settles it
                </label>
                <textarea
                  id={`basis-${a.assignmentId}`}
                  rows={3}
                  value={draft.basis}
                  onChange={(e) => setDraft({ basis: e.target.value })}
                  placeholder="Say which source settles this and why. A vote without a reason isn't a review."
                  className="mt-1 w-full border-2 border-[var(--ink)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-red)]"
                />
                <p className="mt-1 text-xs text-[var(--ink-faint)]">
                  Nobody else&apos;s vote is shown until every reviewer has voted — so this is
                  your own reading, not a second opinion on someone else&apos;s.
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => vote(a, "approve")}
                    className="bg-[var(--ink)] px-5 py-3 text-xs uppercase tracking-[0.16em] text-[var(--paper)] transition-opacity hover:opacity-80 disabled:opacity-40"
                  >
                    Approve the verdict
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => vote(a, "reject")}
                    className="border-2 border-[var(--accent-red)] px-5 py-3 text-xs uppercase tracking-[0.16em] text-[var(--accent-red)] transition-colors hover:bg-[var(--accent-red)] hover:text-[var(--paper)] disabled:opacity-40"
                  >
                    Reject it
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => vote(a, "more_evidence")}
                    className="border-2 border-[var(--ink)] px-5 py-3 text-xs uppercase tracking-[0.16em] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:opacity-40"
                  >
                    Not enough evidence
                  </button>
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
