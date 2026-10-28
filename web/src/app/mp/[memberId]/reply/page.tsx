"use client";

// Right of reply for the MP Record (MP_RECORD_SPEC §9). Replies are published
// only after an operator verifies the sender's office; the contact address is
// never published.

import { Suspense, use, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const inputClass = "mt-1 w-full border border-[var(--rule)] bg-transparent p-2 font-body-serif text-sm text-[var(--ink)]";
const labelClass = "font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]";

export default function MpReplyPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = use(params);
  return (
    <Suspense fallback={null}>
      <ReplyForm memberId={memberId} />
    </Suspense>
  );
}

function ReplyForm({ memberId }: { memberId: string }) {
  const search = useSearchParams();
  const [subjectRecord, setSubjectRecord] = useState(search.get("entry") ?? "");
  const [body, setBody] = useState("");
  const [contact, setContact] = useState("");
  const [identity, setIdentity] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("busy");
    try {
      const res = await fetch(`/api/mp/${memberId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, contact, identity: identity || undefined, subjectRecord: subjectRecord || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      setState(res.ok ? "done" : "error");
      setMessage(json.note ?? json.error ?? `HTTP ${res.status}`);
    } catch {
      setState("error");
      setMessage("Submission failed. Please try again.");
    }
  };

  return (
    <article className="mx-auto max-w-2xl py-6">
      <p className={labelClass}>
        <Link href={`/mp/${memberId}`} className="text-[var(--accent-red)] underline">Back to the record</Link>
      </p>
      <h1 className="mt-2 font-headline text-3xl text-[var(--ink)]">Right of reply</h1>
      <p className="mt-3 font-body-serif text-sm leading-relaxed text-[var(--ink)]">
        The Member, or their office, can attach a response to this record or to a specific entry. We check that a reply
        comes from the Member&rsquo;s office before publishing it, then show it in full beside the record. Use the same
        form to tell us about an error; corrections are published in the corrections log.
      </p>
      {state === "done" ? (
        <p className="mt-6 border border-[var(--rule)] p-4 font-body-serif text-sm text-[var(--ink)]">{message}</p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block">
            <span className={labelClass}>Entry (optional — register entry id, ECRef or figure)</span>
            <input value={subjectRecord} onChange={(e) => setSubjectRecord(e.target.value)} className={inputClass} maxLength={200} />
          </label>
          <label className="block">
            <span className={labelClass}>Your reply (20–4,000 characters)</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} className={`${inputClass} h-40`} required minLength={20} maxLength={4000} />
          </label>
          <label className="block">
            <span className={labelClass}>Who you are (e.g. office of the Member)</span>
            <input value={identity} onChange={(e) => setIdentity(e.target.value)} className={inputClass} maxLength={200} />
          </label>
          <label className="block">
            <span className={labelClass}>Contact email (not published)</span>
            <input type="email" value={contact} onChange={(e) => setContact(e.target.value)} className={inputClass} required maxLength={200} />
          </label>
          <button type="submit" disabled={state === "busy"} className="border border-[var(--ink)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink)]">
            {state === "busy" ? "Sending…" : "Send"}
          </button>
          {state === "error" && message && <p className="font-body-serif text-sm text-[var(--accent-red)]">{message}</p>}
        </form>
      )}
    </article>
  );
}
