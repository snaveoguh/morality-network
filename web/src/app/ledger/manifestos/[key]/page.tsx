import Link from "next/link";
import { notFound } from "next/navigation";
import {
  MANIFESTOS,
  manifestoDebateExtId,
} from "@/lib/ledger/sources/manifestos";
import { getPublishedVerdicts } from "@/lib/ledger/service";
import type { LedgerClaim, LedgerResolution } from "@/lib/ledger/types";
import { BRAND_NAME, withBrand } from "@/lib/brand";

export const revalidate = 3600;

export const metadata = {
  title: withBrand("Manifesto Record — The Claim Ledger"),
};

const VERDICT_LABEL: Record<LedgerResolution["verdict"], string> = {
  true: "Resolved true",
  false: "Resolved false",
  partial: "Partially true",
  unresolved: "Unresolved",
};

const CLAIM_TYPE_LABEL: Record<LedgerClaim["claimType"], string> = {
  retrodictable: "Checkable now",
  predictive: "Checkable later",
  unfalsifiable: "Not checkable",
};

async function loadClaims(extId: string): Promise<LedgerClaim[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const { listLedgerClaimsForDebate } = await import("@/lib/db/ledger-claims");
    return await listLedgerClaimsForDebate(extId);
  } catch {
    return [];
  }
}

export default async function ManifestoRecordPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const manifesto = MANIFESTOS.find((m) => m.key === key);
  if (!manifesto) notFound();

  const claims = await loadClaims(manifestoDebateExtId(manifesto.key));
  const verdicts = await getPublishedVerdicts(claims.map((c) => c.id));
  const checkable = claims.filter((c) => c.claimType !== "unfalsifiable");

  return (
    <section className="mx-auto max-w-4xl py-8">
      <header className="mb-8 border-b-2 border-[var(--rule)] pb-6">
        <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          <Link
            href="/ledger/manifestos"
            className="transition-colors hover:text-[var(--ink)]"
          >
            &larr; Manifestos
          </Link>
        </div>
        <h1 className="font-headline text-3xl text-[var(--ink)] md:text-5xl">
          {manifesto.title}
        </h1>
        <div className="mt-4 flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          <span>
            <strong className="text-[var(--ink)]">{claims.length}</strong> claims
          </span>
          <span className="text-[var(--rule-light)]">|</span>
          <span>
            <strong className="text-[var(--ink)]">{checkable.length}</strong>{" "}
            checkable
          </span>
          <span className="text-[var(--rule-light)]">|</span>
          <span>
            <strong className="text-[var(--ink)]">{verdicts.size}</strong>{" "}
            resolved
          </span>
          <span className="text-[var(--rule-light)]">|</span>
          <a
            href={manifesto.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-red)] underline decoration-1 underline-offset-2"
          >
            Source document
          </a>
        </div>
      </header>

      {claims.length === 0 && (
        <div className="border border-[var(--rule-light)] bg-[var(--paper-dark)]/30 p-8 text-center">
          <p className="font-headline-serif text-xl text-[var(--ink)]">
            Ingest pending.
          </p>
          <p className="mt-2 font-body-serif text-sm italic text-[var(--ink-light)]">
            The backfill runs daily; this manifesto&rsquo;s claims will appear
            once extraction completes.
          </p>
        </div>
      )}

      <ul className="divide-y divide-[var(--rule-light)]">
        {claims.map((claim) => {
          const resolution = verdicts.get(claim.id);
          return (
            <li key={claim.id} className="py-5">
              <blockquote className="border-l-2 border-[var(--rule)] pl-4 font-body-serif text-base leading-relaxed text-[var(--ink)]">
                &ldquo;{claim.verbatimQuote}&rdquo;
              </blockquote>
              <p className="mt-2 pl-4 font-body-serif text-sm text-[var(--ink-light)]">
                {claim.normalizedClaim}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 pl-4 font-mono text-[9px] uppercase tracking-[0.2em]">
                {resolution && resolution.verdict !== "unresolved" ? (
                  <span
                    className={`border px-1.5 py-0.5 font-bold ${
                      resolution.verdict === "false" ||
                      resolution.verdict === "partial"
                        ? "border-[var(--accent-red)] bg-[var(--accent-red)] text-[var(--paper)]"
                        : "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                    }`}
                  >
                    {VERDICT_LABEL[resolution.verdict]}
                  </span>
                ) : (
                  <span className="border border-[var(--ink)] px-1.5 py-0.5 font-bold text-[var(--ink)]">
                    {CLAIM_TYPE_LABEL[claim.claimType]}
                  </span>
                )}
                {claim.resolutionDue && (
                  <span className="text-[var(--ink-faint)]">
                    due {claim.resolutionDue}
                  </span>
                )}
                <span className="text-[var(--rule-light)]">|</span>
                <a
                  href={claim.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent-red)] underline decoration-1 underline-offset-2"
                >
                  Source: manifesto
                </a>
                <span className="text-[var(--rule-light)]">|</span>
                <Link
                  href={`/ledger/dispute?claim=${claim.id}`}
                  className="text-[var(--ink-faint)] underline decoration-1 underline-offset-2 transition-colors hover:text-[var(--accent-red)]"
                >
                  Dispute
                </Link>
              </div>
              {resolution && resolution.evidence.length > 0 && (
                <ul className="mt-2 space-y-1 pl-4">
                  {resolution.evidence.map((e, i) => (
                    <li
                      key={i}
                      className="font-body-serif text-xs text-[var(--ink-light)]"
                    >
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--accent-red)] underline decoration-1 underline-offset-2"
                      >
                        [{e.kind}]
                      </a>{" "}
                      {e.excerpt}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <footer className="mt-12 border-t-2 border-[var(--rule)] pt-4 pb-8 text-center">
        <p className="font-mono text-[8px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          {BRAND_NAME} &bull; the claim ledger &bull; commitments resolve
          against the enacted record
        </p>
      </footer>
    </section>
  );
}
