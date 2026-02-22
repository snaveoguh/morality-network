import { fetchAllProposals } from "@/lib/governance";
import { ProposalsList } from "@/components/proposals/ProposalsList";

export const revalidate = 120;

export default async function ProposalsPage() {
  const proposals = await fetchAllProposals();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">DAO Governance</h1>
      <ProposalsList proposals={proposals} />
    </div>
  );
}
