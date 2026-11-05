"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MODEL_LABEL, STAGES, STAGE_LABEL, type Stage } from "@/lib/coops/types";
import type { OperatorCoop } from "@/lib/db/coop-pipeline";

const input = "w-full border border-[var(--rule)] bg-[var(--paper)] px-2 py-1.5 text-sm text-[var(--ink)]";

interface Edit {
  stage: Stage;
  members: string;
  jobsFte: string;
  supportPounds: string;
  fcaRegNo: string;
  note: string;
}

function toEdit(c: OperatorCoop): Edit {
  return {
    stage: c.stage,
    members: String(c.members),
    jobsFte: String(c.jobsFte),
    supportPounds: String(c.supportPence / 100),
    fcaRegNo: c.fcaRegNo ?? "",
    note: "",
  };
}

function Row({ coop, onSaved }: { coop: OperatorCoop; onSaved: () => void }) {
  const [edit, setEdit] = useState<Edit>(() => toEdit(coop));
  const [status, setStatus] = useState("");
  const set = <K extends keyof Edit>(k: K, v: Edit[K]) => setEdit((e) => ({ ...e, [k]: v }));

  async function save(extra: { isPublic?: boolean } = {}) {
    setStatus("Saving…");
    const res = await fetch("/api/coops/pipeline", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: coop.id,
        stage: edit.stage,
        members: Number(edit.members),
        jobsFte: Number(edit.jobsFte),
        supportPence: Math.round(Number(edit.supportPounds) * 100),
        fcaRegNo: edit.fcaRegNo,
        note: edit.note,
        ...extra,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setStatus(res.ok ? "Saved" : body.error ?? "Failed");
    if (res.ok) onSaved();
  }

  return (
    <li className="border-t border-[var(--rule-light)] py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-headline text-xl text-[var(--ink)]">
          {coop.isPublic ? <Link href={`/coops/c/${coop.slug}`} className="hover:underline">{coop.name}</Link> : coop.name}
        </p>
        <p className="text-sm text-[var(--ink-faint)]">{coop.isPublic ? "Public" : "Waiting for a check"}</p>
      </div>
      <p className="text-sm text-[var(--ink-light)]">
        {MODEL_LABEL[coop.model]} · {coop.sector} · {coop.district ?? "no district"} · {coop.area} · {coop.contactEmail}
        {coop.website ? ` · ${coop.website}` : ""}
      </p>
      {coop.summary && <p className="mt-1 text-[15px] text-[var(--ink)]">{coop.summary}</p>}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <label className="grid gap-1 text-xs text-[var(--ink-faint)]">
          Stage
          <select className={input} value={edit.stage} onChange={(e) => set("stage", e.target.value as Stage)}>
            {STAGES.map((s) => (
              <option key={s} value={s}>{STAGE_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-[var(--ink-faint)]">
          Members
          <input className={input} inputMode="numeric" value={edit.members} onChange={(e) => set("members", e.target.value)} />
        </label>
        <label className="grid gap-1 text-xs text-[var(--ink-faint)]">
          Jobs (FTE)
          <input className={input} inputMode="decimal" value={edit.jobsFte} onChange={(e) => set("jobsFte", e.target.value)} />
        </label>
        <label className="grid gap-1 text-xs text-[var(--ink-faint)]">
          Support (£)
          <input className={input} inputMode="decimal" value={edit.supportPounds} onChange={(e) => set("supportPounds", e.target.value)} />
        </label>
        <label className="grid gap-1 text-xs text-[var(--ink-faint)]">
          FCA reg no.
          <input className={input} value={edit.fcaRegNo} onChange={(e) => set("fcaRegNo", e.target.value)} />
        </label>
      </div>
      <label className="mt-2 grid gap-1 text-xs text-[var(--ink-faint)]">
        Note for the public history (optional)
        <input className={input} value={edit.note} onChange={(e) => set("note", e.target.value)} />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={() => save()} className="border border-[var(--rule)] px-3 py-1.5 hover:bg-[var(--paper-dark)]">
          Save figures
        </button>
        <button
          type="button"
          onClick={() => save({ isPublic: !coop.isPublic })}
          className="bg-[var(--ink)] px-3 py-1.5 text-[var(--paper)] hover:opacity-90"
        >
          {coop.isPublic ? "Hide from tracker" : "Publish on tracker"}
        </button>
        <span className="text-[var(--ink-faint)]">{status}</span>
      </div>
    </li>
  );
}

async function fetchPipeline(): Promise<{ coops: OperatorCoop[] | null; error: string }> {
  const res = await fetch("/api/coops/pipeline", { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { coops: body.coops, error: "" };
  return {
    coops: null,
    error:
      res.status === 401
        ? "Sign in with an operator wallet to review co-ops."
        : res.status === 403
          ? "This wallet is not an operator."
          : body.error ?? "Could not load the pipeline.",
  };
}

export function PipelineAdmin() {
  const [coops, setCoops] = useState<OperatorCoop[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetchPipeline().then(({ coops: list, error: message }) => {
      setError(message);
      if (list) setCoops(list);
    });
  }, []);

  useEffect(load, [load]);

  if (error) return <p className="text-[15px] text-[var(--ink)]">{error}</p>;
  if (!coops) return <p className="text-[15px] text-[var(--ink-faint)]">Loading…</p>;
  if (coops.length === 0) return <p className="text-[15px] text-[var(--ink-light)]">No submissions yet.</p>;
  return (
    <ul>
      {coops.map((c) => (
        <Row key={`${c.id}-${c.updatedAt}`} coop={c} onSaved={load} />
      ))}
    </ul>
  );
}
