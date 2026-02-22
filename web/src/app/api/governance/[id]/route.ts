import { NextResponse } from "next/server";
import { fetchProposalById, fetchAllProposals } from "@/lib/governance";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Try fetching detailed proposal from Snapshot
  const proposal = await fetchProposalById(id);
  if (proposal) {
    return NextResponse.json({ proposal, timestamp: Date.now() });
  }

  // Fallback to finding in all proposals
  const all = await fetchAllProposals();
  const found = all.find((p) => p.id === id);

  if (!found) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  return NextResponse.json({
    proposal: { ...found, onchainVotes: [] },
    timestamp: Date.now(),
  });
}
