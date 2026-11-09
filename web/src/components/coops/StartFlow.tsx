"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ADVISER_QUESTIONS,
  CUK,
  FOUNDING_AGENDA,
  FUNDING_OPTIONS,
  MODEL_OPTIONS,
  checklist,
  type FundingKey,
} from "@/lib/coops/starter";
import { MODEL_LABEL, type Area } from "@/lib/coops/types";

const SECTORS = [
  "Community shop", "Community pub", "Food and farming", "Energy and environment", "Housing",
  "Community land trust", "Care and health", "Arts, culture and education", "Sport and leisure",
  "Technology and media", "Retail", "Manufacturing", "Professional services", "Transport", "Other",
];

const STORAGE_KEY = "coops-start-v1";

interface Draft {
  model: string;
  founders: number;
  funding: FundingKey[];
  area: string;
  name: string;
  district: string;
  sector: string;
  stage: string;
  summary: string;
  website: string;
  contactEmail: string;
}

const EMPTY: Draft = {
  model: "",
  founders: 3,
  funding: [],
  area: "",
  name: "",
  district: "",
  sector: "",
  stage: "idea",
  summary: "",
  website: "",
  contactEmail: "",
};

const STEPS = ["Who owns it", "Founders", "Money", "Your plan", "Join the tracker"];

const input = "w-full border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-[15px] text-[var(--ink)]";
const primary = "bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-[var(--paper)] hover:opacity-90 disabled:opacity-40";
const secondary = "border border-[var(--rule)] px-5 py-2.5 text-sm text-[var(--ink)] hover:bg-[var(--paper-dark)]";

// Rendered client-only (StartFlowLoader), so the saved plan can seed state
// directly without a hydration mismatch.
function savedDraft(): Partial<Draft> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function StartFlow({ areas }: { areas: Area[] }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => ({ ...EMPTY, area: areas[0]?.slug ?? "", ...savedDraft() }));
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [submit, setSubmit] = useState<{ state: "idle" | "sending" | "done" | "error"; message?: string }>({
    state: "idle",
  });

  // Keep an unfinished plan across visits (this browser only).
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {}
  }, [draft]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const option = MODEL_OPTIONS.find((o) => o.model === draft.model) ?? null;
  const area = areas.find((a) => a.slug === draft.area) ?? null;
  const plan = checklist(option, draft.founders, draft.funding);

  async function join() {
    setSubmit({ state: "sending" });
    try {
      const res = await fetch("/api/coops/pipeline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...draft,
          model: draft.model || "undecided",
          consent,
          company: honeypot,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fields = Array.isArray(body.fields) ? ` (${body.fields.join(", ")})` : "";
        setSubmit({ state: "error", message: `${body.error ?? "Something went wrong"}${fields}` });
        return;
      }
      setSubmit({ state: "done" });
    } catch {
      setSubmit({ state: "error", message: "Could not reach the server. Try again." });
    }
  }

  return (
    <div>
      <ol className="mb-8 flex flex-wrap gap-x-4 gap-y-2 text-sm print:hidden" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => setStep(i)}
              aria-current={i === step ? "step" : undefined}
              className={i === step ? "font-medium text-[var(--ink)] underline underline-offset-4" : "text-[var(--ink-faint)] hover:text-[var(--ink)]"}
            >
              {i + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <fieldset>
          <legend className="font-headline text-2xl text-[var(--ink)]">Who should own and control it?</legend>
          <p className="mt-2 text-[15px] text-[var(--ink-light)]">This one answer decides the kind of co-op you are starting.</p>
          <div className="mt-5 grid gap-3">
            {MODEL_OPTIONS.map((o) => (
              <label
                key={o.model}
                className={`flex cursor-pointer gap-3 border p-4 ${draft.model === o.model ? "border-[var(--ink)] bg-[var(--paper-dark)]" : "border-[var(--rule-light)]"}`}
              >
                <input
                  type="radio"
                  name="model"
                  value={o.model}
                  checked={draft.model === o.model}
                  onChange={() => set("model", o.model)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium text-[var(--ink)]">{o.question}</span>
                  <span className="block text-sm text-[var(--ink-light)]">
                    {MODEL_LABEL[o.model]}. {o.example}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-4 text-sm text-[var(--ink-faint)]">
            Not sure? Pick the closest and ask an adviser. You can change it later.
          </p>
        </fieldset>
      )}

      {step === 1 && (
        <div>
          <h2 className="font-headline text-2xl text-[var(--ink)]">How many founders do you have?</h2>
          <p className="mt-2 text-[15px] text-[var(--ink-light)]">
            Founders are the people who will sign up as the first members. A society needs at least three.
          </p>
          <input
            type="number"
            min={1}
            max={500}
            value={draft.founders}
            onChange={(e) => set("founders", Math.max(1, Number(e.target.value) || 1))}
            className={`${input} mt-5 max-w-[8rem]`}
            aria-label="Number of founders"
          />
          {draft.founders < 3 && (
            <p className="mt-3 text-[15px] text-[var(--ink)]">
              You need {3 - draft.founders} more before you can register. You can still plan now.
            </p>
          )}
        </div>
      )}

      {step === 2 && (
        <fieldset>
          <legend className="font-headline text-2xl text-[var(--ink)]">How will you fund the start?</legend>
          <p className="mt-2 text-[15px] text-[var(--ink-light)]">Tick all that might apply.</p>
          <div className="mt-5 grid gap-3">
            {FUNDING_OPTIONS.map((f) => {
              const checked = draft.funding.includes(f.key);
              return (
                <label
                  key={f.key}
                  className={`flex cursor-pointer gap-3 border p-4 ${checked ? "border-[var(--ink)] bg-[var(--paper-dark)]" : "border-[var(--rule-light)]"}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      set("funding", checked ? draft.funding.filter((k) => k !== f.key) : [...draft.funding, f.key])
                    }
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-medium text-[var(--ink)]">{f.label}</span>
                    <span className="block text-sm text-[var(--ink-light)]">{f.note}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {step === 3 && (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-headline text-2xl text-[var(--ink)]">Your plan</h2>
            <button type="button" onClick={() => window.print()} className={`${secondary} print:hidden`}>
              Print or save as PDF
            </button>
          </div>

          <div className="mt-5 bg-[#f2ede2] p-4 text-[#0d0d0d] sm:p-5">
            <p className="text-sm">You are starting a</p>
            <p className="font-headline text-2xl">{option ? MODEL_LABEL[option.model] : "co-op (model not chosen yet)"}</p>
            <p className="mt-2 text-[15px]">
              Legal form: <strong className="font-medium">{option?.legalForm ?? "to decide with an adviser"}</strong>.{" "}
              {option?.formNote}
            </p>
          </div>

          <div className="mt-8 space-y-6">
            {plan.map((s, i) => (
              <section key={s.stage}>
                <h3 className="font-headline text-xl font-semibold text-[var(--ink)]">
                  {i + 1}. {s.stage}
                </h3>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-[var(--ink-light)]">
                  {s.tasks.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <section className="mt-8 border-t-4 border-double border-[var(--ink)] pt-5">
            <h3 className="font-headline text-xl font-semibold text-[var(--ink)]">Founding meeting agenda</h3>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed text-[var(--ink-light)]">
              {FOUNDING_AGENDA.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </section>

          <section className="mt-8 border-t-4 border-double border-[var(--ink)] pt-5">
            <h3 className="font-headline text-xl font-semibold text-[var(--ink)]">Questions to ask an adviser</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-[var(--ink-light)]">
              {ADVISER_QUESTIONS.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
            <p className="mt-4 text-[15px] text-[var(--ink-light)]">
              Co-operatives UK gives free start-up advice, publishes the model rules and runs the registration service:
            </p>
            <ul className="mt-2 space-y-1 text-[15px]">
              <li><a className="text-[var(--ink)] underline" href={CUK.start} target="_blank" rel="noopener noreferrer">Start a new co-op</a></li>
              <li><a className="text-[var(--ink)] underline" href={CUK.modelRules} target="_blank" rel="noopener noreferrer">Model governing documents</a></li>
              <li><a className="text-[var(--ink)] underline" href={CUK.register} target="_blank" rel="noopener noreferrer">Register your co-op</a> (check the current fee there)</li>
              <li><a className="text-[var(--ink)] underline" href={CUK.adviser} target="_blank" rel="noopener noreferrer">Talk to an adviser</a></li>
            </ul>
          </section>

          <p className="mt-8 text-sm text-[var(--ink-faint)]">
            This plan is general guidance, not legal or financial advice.
          </p>
        </div>
      )}

      {step === 4 && (
        <div>
          <h2 className="font-headline text-2xl text-[var(--ink)]">Join the tracker</h2>
          <p className="mt-2 max-w-2xl text-[15px] text-[var(--ink-light)]">
            Add your co-op to the public tracker so the support you get, and how you are doing, is counted. We check each
            entry before it appears. Your email is never shown.
          </p>

          {submit.state === "done" ? (
            <div className="mt-6 bg-[#f2ede2] p-5 text-[#0d0d0d]">
              <p className="font-headline text-xl">Thanks, {draft.name} is in.</p>
              <p className="mt-2 text-[15px]">
                It will appear on the {area?.name ?? ""} tracker once checked. We may contact you at{" "}
                {draft.contactEmail} to confirm the details.
              </p>
              {area && (
                <Link href={`/coops/${area.slug}`} className="mt-3 inline-block underline">
                  See the {area.name} tracker
                </Link>
              )}
            </div>
          ) : (
            <form
              className="mt-6 grid max-w-2xl gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void join();
              }}
            >
              <label className="grid gap-1 text-sm text-[var(--ink)]">
                Co-op name (a working name is fine)
                <input required minLength={2} maxLength={120} className={input} value={draft.name} onChange={(e) => set("name", e.target.value)} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1 text-sm text-[var(--ink)]">
                  Area
                  <select className={input} value={draft.area} onChange={(e) => { set("area", e.target.value); set("district", ""); }}>
                    {areas.map((a) => (
                      <option key={a.slug} value={a.slug}>{a.name}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm text-[var(--ink)]">
                  District
                  <select className={input} value={draft.district} onChange={(e) => set("district", e.target.value)}>
                    <option value="">Not sure yet</option>
                    {area?.districts.map((d) => (
                      <option key={d.name}>{d.name}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm text-[var(--ink)]">
                  Sector
                  <select required className={input} value={draft.sector} onChange={(e) => set("sector", e.target.value)}>
                    <option value="">Choose one</option>
                    {SECTORS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm text-[var(--ink)]">
                  Where you are now
                  <select className={input} value={draft.stage} onChange={(e) => set("stage", e.target.value)}>
                    <option value="idea">Testing the idea</option>
                    <option value="forming">Forming: meeting, choosing rules</option>
                    <option value="registered">Registered with the FCA</option>
                    <option value="trading">Trading</option>
                  </select>
                </label>
              </div>
              <label className="grid gap-1 text-sm text-[var(--ink)]">
                What the co-op does, in a sentence or two
                <textarea maxLength={600} rows={3} className={input} value={draft.summary} onChange={(e) => set("summary", e.target.value)} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1 text-sm text-[var(--ink)]">
                  Website (optional)
                  <input maxLength={200} className={input} value={draft.website} onChange={(e) => set("website", e.target.value)} />
                </label>
                <label className="grid gap-1 text-sm text-[var(--ink)]">
                  Contact email (not shown)
                  <input required type="email" maxLength={200} className={input} value={draft.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
                </label>
              </div>
              <input
                type="text"
                name="company"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                className="hidden"
                aria-hidden
              />
              <label className="flex gap-3 text-sm text-[var(--ink-light)]">
                <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                <span>
                  I agree that the co-op&apos;s name, model, sector, district, stage and the figures we report can be
                  shown publicly on the tracker. See the{" "}
                  <Link href="/privacy" className="underline">privacy notice</Link>.
                </span>
              </label>
              {submit.state === "error" && <p className="text-[15px] text-[var(--ink)]">{submit.message}</p>}
              <div>
                <button type="submit" className={primary} disabled={submit.state === "sending"}>
                  {submit.state === "sending" ? "Sending…" : "Add us to the tracker"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      <div className="mt-10 flex gap-3 print:hidden">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className={secondary}>
            Back
          </button>
        )}
        {step < STEPS.length - 1 && (
          <button type="button" onClick={() => setStep(step + 1)} className={primary} disabled={step === 0 && !draft.model}>
            {step === 3 ? "Next: join the tracker" : "Next"}
          </button>
        )}
      </div>
    </div>
  );
}
