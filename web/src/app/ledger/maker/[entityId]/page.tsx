import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { LedgerDispute } from "@/lib/db/ledger-disputes";
import type { LedgerEntity } from "@/lib/db/ledger-entities";
import { getAnsweredDisputes, getPublishedVerdicts } from "@/lib/ledger/service";
import { computeCalibration, SCORE_DISPLAY_THRESHOLD } from "@/lib/ledger/score";
import { CONTEXT_LABEL, claimSourceLabel, isValidEntityId } from "@/lib/ledger/entities";
import type { LedgerClaim, LedgerResolution } from "@/lib/ledger/types";
import { BRAND_NAME, withBrand } from "@/lib/brand";

export const revalidate = 1800;

// Manufacturer record page (migration 018). Same rules as the member page:
// verbatim quote, date, source, and a verdict only when one has been through
// the human review gate. Only PUBLIC claims are read — anything still held
// for review never reaches this page. The calibration score is withheld below
// n≥20 resolved claims; the page says how far off the threshold is instead.
// Status is plain text (pooter-brand: no stamps, badges or seals).

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

const LINK = "underline decoration-1 underline-offset-2 hover:text-[var(--ink)]";

async function loadEntity(
  entityId: string,
): Promise<{ entity: LedgerEntity; claims: LedgerClaim[] } | null> {
  if (!process.env.DATABASE_URL || !isValidEntityId(entityId)) return null;
  try {
    const [{ getLedgerEntity }, { listPublicLedgerClaimsForEntity }] = await Promise.all([
      import("@/lib/db/ledger-entities"),
      import("@/lib/db/ledger-claims"),
    ]);
    const entity = await getLedgerEntity(entityId);
    if (!entity) return null;
    return { entity, claims: await listPublicLedgerClaimsForEntity(entityId) };
  } catch (error) {
    console.warn("[ledger/maker] read failed:", error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ entityId: string }>;
}): Promise<Metadata> {
  const { entityId } = await params;
  const loaded = await loadEntity(entityId);
  return {
    title: withBrand(`${loaded?.entity.name ?? "Manufacturer"} — The Claim Ledger`),
    description:
      "Published privacy and security statements by a hardware manufacturer, quoted verbatim with sources, and checked against documented outcomes after human review.",
  };
}

export default async function MakerLedgerPage({
  params,
}: {
  params: Promise<{ entityId: string }>;
}) {
  const { entityId } = await params;
  const loaded = await loadEntity(entityId);
  if (!loaded) notFound();
  const { entity, claims } = loaded;

  const ids = claims.map((c) => c.id);
  const [verdicts, disputes] = await Promise.all([
    getPublishedVerdicts(ids),
    getAnsweredDisputes(ids),
  ]);
  const calibration = computeCalibration(claims, verdicts);

  const subline = [entity.legalName, entity.country, entity.products.join(", ") || null]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="mx-auto max-w-4xl px-4 py-8 md:px-0">
      <header className="mb-8 border-b-4 border-double border-[var(--rule)] pb-6">
        <div className="mb-3 flex items-center gap-3 text-xs text-[var(--ink-faint)]">
          <Link href="/ledger" className="transition-colors hover:text-[var(--ink)]">
            &larr; The Ledger
          </Link>
          <span aria-hidden>·</span>
          <span>Manufacturer record</span>
        </div>
        <h1 className="font-headline text-4xl text-[var(--ink)] md:text-5xl">{entity.name}</h1>
        <p className="mt-2 text-sm text-[var(--ink-light)]">
          {subline || "—"}
          {entity.website && (
            <>
              {" · "}
              <a href={entity.website} target="_blank" rel="noopener noreferrer" className={LINK}>
                Company website
              </a>
            </>
          )}
        </p>

        <dl className="mt-5 grid grid-cols-2 gap-4 border border-[var(--rule-light)] p-4 md:grid-cols-4">
          <Stat value={String(calibration.nClaims)} label="claims on record" />
          <Stat value={String(calibration.nResolved)} label="resolved" />
          <Stat
            value={calibration.nClaims > 0 ? `${calibration.checkabilityRate}%` : "—"}
            label="checkability rate"
          />
          {calibration.scoreVisible ? (
            <Stat
              value={`${calibration.pctTrue}%`}
              label={`resolved true (n=${calibration.nResolved})`}
            />
          ) : (
            <Stat
              value="—"
              faint
              label={`score at ${SCORE_DISPLAY_THRESHOLD} resolved (${calibration.resolvedNeeded} to go)`}
            />
          )}
        </dl>
        <p className="mt-2 text-xs text-[var(--ink-faint)]">
          No score displays below {SCORE_DISPLAY_THRESHOLD} resolved claims. Small samples
          mislead in both directions.
        </p>
      </header>

      {claims.length === 0 ? (
        <p className="font-body-serif text-base leading-relaxed text-[var(--ink-light)]">
          No claims on the public record yet. Claims about manufacturers publish only after
          human review, each with the company&rsquo;s own published wording and a source.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--rule-light)]">
          {claims.map((claim) => (
            <ClaimRow
              key={claim.id}
              claim={claim}
              resolution={verdicts.get(claim.id)}
              disputes={disputes.get(claim.id)}
            />
          ))}
        </ul>
      )}

      <footer className="mt-12 border-t-4 border-double border-[var(--rule)] pt-4 pb-8 text-center">
        <p className="text-xs text-[var(--ink-faint)]">
          {BRAND_NAME} · the claim ledger · every verdict links its records · right of reply:{" "}
          {entity.name} may attach a response to any claim on this page
        </p>
      </footer>
    </section>
  );
}

function Stat({ value, label, faint }: { value: string; label: string; faint?: boolean }) {
  return (
    <div>
      <dd
        className={`font-headline text-3xl ${faint ? "text-[var(--ink-faint)]" : "text-[var(--ink)]"}`}
      >
        {value}
      </dd>
      <dt className="text-[11px] text-[var(--ink-faint)]">{label}</dt>
    </div>
  );
}

function ClaimRow({
  claim,
  resolution,
  disputes,
}: {
  claim: LedgerClaim;
  resolution: LedgerResolution | undefined;
  disputes: LedgerDispute[] | undefined;
}) {
  const status =
    resolution && resolution.verdict !== "unresolved"
      ? VERDICT_LABEL[resolution.verdict]
      : CLAIM_TYPE_LABEL[claim.claimType];
  return (
    <li className="py-5">
      <blockquote className="border-l-2 border-[var(--rule)] pl-4 font-body-serif text-base leading-relaxed text-[var(--ink)]">
        &ldquo;{claim.verbatimQuote}&rdquo;
      </blockquote>
      <p className="mt-2 pl-4 font-body-serif text-sm text-[var(--ink-light)]">
        {claim.normalizedClaim}
      </p>
      <p className="mt-3 pl-4 text-xs text-[var(--ink-light)]">
        {status} · {CONTEXT_LABEL[claim.context] ?? claim.context} · {claim.utteredAt} ·{" "}
        <a href={claim.sourceUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
          Source: {claimSourceLabel(claim.sourceUrl)}
        </a>{" "}
        ·{" "}
        <Link href={`/ledger/dispute?claim=${claim.id}`} className={LINK}>
          Reply or dispute
        </Link>
      </p>

      {resolution && resolution.evidence.length > 0 && (
        <ul className="mt-2 space-y-1 pl-4">
          {resolution.evidence.map((e, i) => (
            <li key={i} className="font-body-serif text-xs text-[var(--ink-light)]">
              <a href={e.url} target="_blank" rel="noopener noreferrer" className={LINK}>
                {claimSourceLabel(e.url)}
              </a>{" "}
              {e.excerpt}
            </li>
          ))}
        </ul>
      )}

      {disputes && disputes.length > 0 && (
        <div className="mt-3 border-l-2 border-[var(--rule-light)] pl-4">
          {disputes.map((d) => (
            <div key={d.id} className="mt-1">
              <p className="text-[11px] text-[var(--ink-faint)]">Right of reply</p>
              <p className="mt-1 font-body-serif text-xs leading-relaxed text-[var(--ink-light)]">
                {d.body}
              </p>
              {d.response && (
                <p className="mt-1 font-body-serif text-xs italic leading-relaxed text-[var(--ink-faint)]">
                  Ledger response: {d.response}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
