import { fetchAllProposals, fetchSingleProposal } from "@/lib/governance";
import { ProposalDetail } from "@/components/proposals/ProposalDetail";
import Link from "next/link";

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function AsyncProposalDetail({ id }: { id: string }) {
  let detailedProposal = await withTimeout(fetchSingleProposal(id), 15000, null);

  if (!detailedProposal) {
    const all = await withTimeout(fetchAllProposals(), 15000, []);
    const found = all.find((p) => p.id === id);
    if (!found) {
      return (
        <div className="py-20 text-center">
          <h1 className="font-headline text-3xl text-[var(--ink)]">
            Proposal Not Found
          </h1>
          <p className="mt-2 font-body-serif text-sm text-[var(--ink-faint)]">
            The proposal &quot;{id}&quot; could not be located in our records.
          </p>
          <Link
            href="/proposals"
            className="mt-4 inline-block font-mono text-xs uppercase tracking-wider text-[var(--ink-light)] hover:text-[var(--ink)]"
          >
            &larr; Return to Governance
          </Link>
        </div>
      );
    }
    detailedProposal = { ...found, onchainVotes: [] };
  }

  return <ProposalDetail proposal={detailedProposal} />;
}
