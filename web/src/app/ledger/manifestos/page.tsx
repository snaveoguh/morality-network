import Link from "next/link";
import {
  MANIFESTOS,
  manifestoDebateExtId,
} from "@/lib/ledger/sources/manifestos";
import { BRAND_NAME, withBrand } from "@/lib/brand";

export const revalidate = 3600;

export const metadata = {
  title: withBrand("Manifestos — The Claim Ledger"),
  description:
    "General-election manifesto commitments, extracted verbatim and tracked against the enacted record.",
};

async function claimCounts(): Promise<Map<string, number>> {
  if (!process.env.DATABASE_URL) return new Map();
  try {
    const { countClaimsByDebate } = await import("@/lib/db/ledger-claims");
    return await countClaimsByDebate(
      MANIFESTOS.map((m) => manifestoDebateExtId(m.key)),
    );
  } catch {
    return new Map();
  }
}

export default async function ManifestosPage() {
  const counts = await claimCounts();

  return (
    <section className="mx-auto max-w-4xl py-8">
      <header className="mb-8 border-b-2 border-[var(--rule)] pb-6">
        <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          <Link href="/ledger" className="transition-colors hover:text-[var(--ink)]">
            &larr; The Ledger
          </Link>
          <span className="text-[var(--rule-light)]">|</span>
          <span>Manifestos</span>
        </div>
        <h1 className="font-headline text-4xl text-[var(--ink)] md:text-5xl">
          Manifesto Commitments
        </h1>
        <p className="mt-3 max-w-2xl font-body-serif text-base leading-relaxed text-[var(--ink-light)]">
          What the parties committed to in writing, quoted verbatim from their
          manifestos and tracked against the enacted record. Commitments are
          claims with the parliament as their horizon.
        </p>
      </header>

      <ul className="divide-y divide-[var(--rule-light)]">
        {MANIFESTOS.map((m) => {
          const n = counts.get(manifestoDebateExtId(m.key)) ?? 0;
          return (
            <li key={m.key}>
              <Link
                href={`/ledger/manifestos/${m.key}`}
                className="group flex items-baseline justify-between gap-4 py-5"
              >
                <div>
                  <h2 className="font-headline-serif text-xl font-bold text-[var(--ink)] transition-colors group-hover:text-[var(--accent-red)]">
                    {m.title}
                  </h2>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                    {m.party} &middot; published {m.publishedAt}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-light)]">
                  {n > 0 ? `${n} claims` : "ingest pending"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <footer className="mt-12 border-t-2 border-[var(--rule)] pt-4 pb-8 text-center">
        <p className="font-mono text-[8px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          {BRAND_NAME} &bull; the claim ledger &bull; quotes are verbatim from
          the published documents
        </p>
      </footer>
    </section>
  );
}
