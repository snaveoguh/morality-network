import { Suspense } from "react";
import { fetchAllProposals, fetchGovernanceSocialSignals } from "@/lib/governance";
import { GovernanceSocialList } from "@/components/proposals/GovernanceSocialList";
import { ProposalsList } from "@/components/proposals/ProposalsList";

export const revalidate = 3600; // 1 hour ISR
export const maxDuration = 55;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export default function ProposalsPage() {
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
      <Suspense fallback={<GovernanceSkeleton />}>
        <AsyncGovernanceContent />
      </Suspense>
    </div>
  );
}

async function AsyncGovernanceContent() {
  const [proposals, socialSignals] = await Promise.all([
    withTimeout(fetchAllProposals(), 8000, []),
    withTimeout(fetchGovernanceSocialSignals(), 6000, []),
  ]);

  return (
    <>
      <GovernanceSocialList signals={socialSignals} />
      <ProposalsList proposals={proposals} />
    </>
  );
}

function GovernanceSkeleton() {
  return (
    <div className="space-y-3 py-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="border border-[var(--rule-light)] p-4">
          <div className="h-3 w-3/4 bg-[var(--paper-dark)]" />
          <div className="mt-2 h-2 w-1/2 bg-[var(--paper-dark)]" />
          <div className="mt-1 h-2 w-1/3 bg-[var(--paper-dark)]" />
        </div>
      ))}
    </div>
  );
}
