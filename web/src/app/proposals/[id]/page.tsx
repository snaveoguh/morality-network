import { fetchAllProposals, fetchProposalById } from "@/lib/governance";
import { ProposalDetail } from "@/components/proposals/ProposalDetail";
import Link from "next/link";

export const revalidate = 60;

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProposalPage({ params }: Props) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  // Try fetching detailed proposal with votes from Snapshot
  let detailedProposal = await fetchProposalById(decodedId);

  // Fallback: find from all proposals list
  if (!detailedProposal) {
    const all = await fetchAllProposals();
    const found = all.find((p) => p.id === decodedId);
    if (!found) {
      return (
        <div className="py-20 text-center">
          <h1 className="text-2xl font-bold text-white">Proposal not found</h1>
          <p className="mt-2 text-zinc-400">
            The proposal &quot;{decodedId}&quot; could not be found.
          </p>
          <Link
            href="/proposals"
            className="mt-4 inline-block text-[#2F80ED] hover:underline"
          >
            Back to Proposals
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
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-white"
      >
        <span>&larr;</span> All Proposals
      </Link>

      <ProposalDetail proposal={detailedProposal} />
    </div>
  );
}
