import { fetchAllProposals, fetchGovernanceSocialSignals } from "@/lib/governance";
import { GovernanceSocialList } from "@/components/proposals/GovernanceSocialList";
import { ProposalsList } from "@/components/proposals/ProposalsList";

export const revalidate = 60; // 1 min ISR
export const maxDuration = 55;

/** Race a promise against a timeout — returns fallback on timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export default async function ProposalsPage() {
  const [proposals, socialSignals] = await Promise.all([
    withTimeout(fetchAllProposals(), 8000, []),
    withTimeout(fetchGovernanceSocialSignals(), 6000, []),
  ]);

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
      <GovernanceSocialList signals={socialSignals} />
      <ProposalsList proposals={proposals} />
    </div>
  );
}
