// GET /api/editorial/today/mint-payload
//
// Returns the minimal data a backend minter needs to call
// PooterEditions.mintFor(to, editionNumber, contentHash, dailyTitle) for
// today's daily edition. Public, read-only. All values already public after
// the mint anyway; the endpoint just saves the minter from re-deriving them.

import { NextResponse } from "next/server";
import {
  POOTER_EDITIONS_ADDRESS,
  ZERO_ADDRESS,
} from "@/lib/contracts";
import {
  EDITION_EPOCH,
  EDITION_SECONDS_PER_DAY,
  getEditionContext,
} from "@/lib/server/edition-context";

export const dynamic = "force-dynamic";

function currentTokenId(): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.floor((now - EDITION_EPOCH) / EDITION_SECONDS_PER_DAY) + 1;
}

export async function GET() {
  if (POOTER_EDITIONS_ADDRESS === ZERO_ADDRESS) {
    return NextResponse.json(
      { error: "POOTER_EDITIONS contract not configured" },
      { status: 503 },
    );
  }

  const tokenId = currentTokenId();
  const ctx = await getEditionContext(tokenId);

  const contentHash = ctx.officialContentHash ?? ctx.onchainContentHash ?? null;
  const dailyTitle = ctx.officialTitle ?? ctx.onchainTitle ?? null;

  if (!contentHash || !dailyTitle) {
    return NextResponse.json(
      {
        error: "today's editorial not yet generated",
        tokenId,
        hasContentHash: !!contentHash,
        hasDailyTitle: !!dailyTitle,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    tokenId,
    contentHash,
    dailyTitle,
    editionsAddress: POOTER_EDITIONS_ADDRESS,
    isMinted: ctx.isMinted,
    owner: ctx.owner,
    chainId: 8453,
  });
}
