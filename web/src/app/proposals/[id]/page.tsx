import { fetchAllProposals, fetchSingleProposal } from "@/lib/governance";
import { ProposalDetail } from "@/components/proposals/ProposalDetail";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const maxDuration = 55;

/** Race a promise against a timeout — returns fallback on timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProposalPage({ params }: Props) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  // Try direct fetch first (fast — fetches only the one proposal)
  let detailedProposal = await withTimeout(fetchSingleProposal(decodedId), 15000, null);

  // Fallback: find from all proposals list (slow — fetches everything)
  if (!detailedProposal) {
    const all = await withTimeout(fetchAllProposals(), 15000, []);
    const found = all.find((p) => p.id === decodedId);
    if (!found) {
      return (
        <div className="py-20 text-center">
          <h1 className="font-headline text-3xl text-[var(--ink)]">
            Proposal Not Found
          </h1>
          <p className="mt-2 font-body-serif text-sm text-[var(--ink-faint)]">
            The proposal &quot;{decodedId}&quot; could not be located in our records.
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

  return (
    <div>
      <Link
        href="/proposals"
        className="mb-4 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
      >
        &larr; All Governance
      </Link>

      <ProposalDetail proposal={detailedProposal} />
    </div>
  );
}
