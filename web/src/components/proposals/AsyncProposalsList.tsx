import { fetchAllProposals } from "@/lib/governance";
import { ProposalsList } from "@/components/proposals/ProposalsList";

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function AsyncProposalsList() {
  const proposals = await withTimeout(fetchAllProposals(), 8000, []);
  return <ProposalsList proposals={proposals} />;
}
