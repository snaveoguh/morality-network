import { NextResponse } from "next/server";
import { fetchAllProposals, fetchLiveProposals, fetchControversialProposals } from "@/lib/governance";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter");

  let proposals;

  switch (filter) {
    case "live":
      proposals = await fetchLiveProposals();
      break;
    case "controversial":
      proposals = await fetchControversialProposals();
      break;
    default:
      proposals = await fetchAllProposals();
  }

  return NextResponse.json({
    proposals,
    total: proposals.length,
    timestamp: Date.now(),
  });
}
