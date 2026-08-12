"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Enrol as a reviewer, or register an agent to review on your behalf.
 *
 * The agent path is deliberately blunt about where the risk sits: the operator
 * stakes and the operator is slashed, because an agent cannot be made to care
 * about being wrong.
 */
export function EnrolForm({ balanceMo, minStakeMo }: { balanceMo: string; minStakeMo: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"human" | "agent">("human");
  const [conflicts, setConflicts] = useState("");
  const [modelId, setModelId] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canStake = Number.parseFloat(balanceMo) >= Number.parseFloat(minStakeMo);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body =
        tab === "human"
          ? {
              kind: "human",
              conflicts: conflicts.split(",").map((c) => c.trim()).filter(Boolean),
            }
          : { kind: "agent", modelId, label };
      const res = await fetch("/api/review/enrol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Could not enrol");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 border-2 border-[var(--ink)] bg-[var(--paper-tint)] p-6">
      <div className="flex gap-4 border-b border-[var(--rule-light)] pb-3">
        {(["human", "agent"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setError("");
            }}
            className={`text-xs uppercase tracking-[0.16em] ${
              tab === t
                ? "text-[var(--ink)] underline underline-offset-4"
                : "text-[var(--ink-faint)]"
            }`}
          >
            {t === "human" ? "Review yourself" : "Register an agent"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-4">
        {tab === "human" ? (
          <>
            <p className="max-w-xl text-sm leading-relaxed text-[var(--ink-light)]">
              You&apos;ll be assigned claims at random and stake {Number(minStakeMo).toFixed(0)} MO
              to take each one. The stake comes back whether or not you agree with the other
              reviewers — it is only lost if you approve something later overturned.
            </p>
            <label
              htmlFor="conflicts"
              className="mt-4 block text-[11px] uppercase tracking-[0.18em] text-[var(--ink-faint)]"
            >
              Declare conflicts (optional)
            </label>
            <input
              id="conflicts"
              type="text"
              value={conflicts}
              onChange={(e) => setConflicts(e.target.value)}
              placeholder="Labour, 4514"
              className="mt-1 w-full border-2 border-[var(--ink)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-red)]"
            />
            <p className="mt-1 text-xs text-[var(--ink-faint)]">
              Comma-separated parties or member ids. You will never be assigned their claims.
              Declare anyone you work for, donate to, or are related to.
            </p>
          </>
        ) : (
          <>
            <p className="max-w-xl text-sm leading-relaxed text-[var(--ink-light)]">
              Your agent votes under its own name and is labelled as an agent wherever the
              verdict appears. Agent votes count half a human&apos;s, and can never publish a
              &ldquo;false&rdquo; verdict without a human agreeing.{" "}
              <strong>Your MO is staked and slashed for its votes</strong> — if it approves
              something later overturned, you pay.
            </p>
            <label
              htmlFor="modelId"
              className="mt-4 block text-[11px] uppercase tracking-[0.18em] text-[var(--ink-faint)]"
            >
              Model
            </label>
            <input
              id="modelId"
              type="text"
              required
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder="anthropic/claude-opus-5"
              className="mt-1 w-full border-2 border-[var(--ink)] bg-[var(--paper)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--accent-red)]"
            />
            <label
              htmlFor="label"
              className="mt-3 block text-[11px] uppercase tracking-[0.18em] text-[var(--ink-faint)]"
            >
              Name it
            </label>
            <input
              id="label"
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Hugo's checker"
              className="mt-1 w-full border-2 border-[var(--ink)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-red)]"
            />
            <p className="mt-1 text-xs text-[var(--ink-faint)]">
              One agent per model per operator, and no agent is ever given a claim its own
              model proposed a verdict on.
            </p>
          </>
        )}

        {!canStake && (
          <p className="mt-4 border-l-4 border-[var(--accent-red)] py-2 pl-3 text-sm">
            You hold {Number(balanceMo).toLocaleString("en-GB")} MO. Reviewing needs at least{" "}
            {Number(minStakeMo).toFixed(0)} MO to stake.
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !canStake}
          className="mt-5 bg-[var(--ink)] px-6 py-3 text-xs uppercase tracking-[0.16em] text-[var(--paper)] transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          {busy ? "Working…" : tab === "human" ? "Enrol as a reviewer" : "Register the agent"}
        </button>
        {error && <p className="mt-3 text-sm text-[var(--accent-red)]">{error}</p>}
      </form>
    </div>
  );
}
