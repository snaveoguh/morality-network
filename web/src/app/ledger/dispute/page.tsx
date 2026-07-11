"use client";

// Right of reply — dispute submission form (spec §Legal guardrails).
// Quoted figures (or anyone) can dispute a claim; disputes display inline
// only after verification and an operator response.

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function DisputeForm() {
  const params = useSearchParams();
  const [claimId, setClaimId] = useState(params.get("claim") ?? "");
  const [body, setBody] = useState("");
  const [contact, setContact] = useState("");
  const [identity, setIdentity] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("busy");
    try {
      const res = await fetch("/api/ledger/dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId, body, contact, identity: identity || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setState("done");
        setMessage(json.note ?? "Submitted.");
      } else {
        setState("error");
        setMessage(json.error ?? `HTTP ${res.status}`);
      }
    } catch {
      setState("error");
      setMessage("submission failed — try again");
    }
  };

  if (state === "done") {
    return (
      <div className="border border-[var(--rule)] p-8 text-center">
        <p className="font-headline-serif text-xl text-[var(--ink)]">
          Dispute received.
        </p>
        <p className="mt-2 font-body-serif text-sm italic text-[var(--ink-light)]">
          {message}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          Claim id (from the claim&rsquo;s dispute link)
        </label>
        <input
          value={claimId}
          onChange={(e) => setClaimId(e.target.value.trim())}
          required
          pattern="[a-f0-9]{32}"
          className="mt-1 w-full border border-[var(--rule)] bg-transparent p-2 font-mono text-xs text-[var(--ink)]"
        />
      </div>
      <div>
        <label className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          Your dispute — what the record shows, with links where possible
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          minLength={20}
          maxLength={4000}
          rows={6}
          className="mt-1 w-full border border-[var(--rule)] bg-transparent p-2 font-body-serif text-sm text-[var(--ink)]"
        />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
            Contact email (for verification; never displayed)
          </label>
          <input
            type="email"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            required
            className="mt-1 w-full border border-[var(--rule)] bg-transparent p-2 font-mono text-xs text-[var(--ink)]"
          />
        </div>
        <div>
          <label className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
            Acting for the quoted figure? Name your office (optional)
          </label>
          <input
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            className="mt-1 w-full border border-[var(--rule)] bg-transparent p-2 font-mono text-xs text-[var(--ink)]"
          />
        </div>
      </div>
      {state === "error" && (
        <p className="border border-[var(--accent-red)] p-2 font-mono text-xs text-[var(--accent-red)]">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={state === "busy"}
        className="border border-[var(--ink)] px-5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:opacity-40"
      >
        Submit dispute
      </button>
    </form>
  );
}

export default function LedgerDisputePage() {
  return (
    <section className="mx-auto max-w-2xl py-8">
      <header className="mb-8 border-b-2 border-[var(--rule)] pb-6">
        <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          <Link href="/ledger" className="transition-colors hover:text-[var(--ink)]">
            &larr; The Ledger
          </Link>
          <span className="text-[var(--rule-light)]">|</span>
          <span>Right of Reply</span>
        </div>
        <h1 className="font-headline text-4xl text-[var(--ink)]">
          Dispute a Claim
        </h1>
        <p className="mt-3 font-body-serif text-base leading-relaxed text-[var(--ink-light)]">
          Any quoted figure — or anyone with better records — can dispute an
          entry. Verified disputes and their responses display inline with the
          claim. Corrections are published, versioned, and fast.
        </p>
      </header>
      <Suspense fallback={null}>
        <DisputeForm />
      </Suspense>
    </section>
  );
}
