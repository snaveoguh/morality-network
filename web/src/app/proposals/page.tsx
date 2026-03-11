import { fetchAllProposals } from "@/lib/governance";
import { ProposalsList } from "@/components/proposals/ProposalsList";

export const dynamic = "force-dynamic";

/** Race a promise against a timeout — returns fallback on timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export default async function ProposalsPage() {
  const proposals = await withTimeout(fetchAllProposals(), 8000, []);

  return (
    <div>
      <div className="mb-6 border-b-2 border-[var(--rule)] pb-4">
        <h1 className="font-headline text-3xl text-[var(--ink)]">
          Governance
        </h1>
        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
          Nouns DAO · Parliament · Congress · Hyperliquid · Governance Wire
        </p>
      </div>
      <ProposalsList proposals={proposals} />
    </div>
  );
}
