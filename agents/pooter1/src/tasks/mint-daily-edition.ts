/**
 * pooter1 daily edition mint — routes the mint through pooter1's Base smart
 * wallet via the web signing API (Wedge A of the per-agent smart wallets
 * workstream).
 *
 * Prereqs:
 *   - BASE_SMART_WALLETS_ENABLED=true on the web service
 *   - pooter1's smart wallet address must be set as the `minter` on the
 *     PooterEditions contract (one-time admin call `setMinter(addr)`)
 *   - AGENT_WORKER_HMAC_SECRET set identically on web and pooter1
 *   - AGENT_API_BASE_URL on pooter1 → https://dev.pooter.world (or prod)
 *
 * The task is idempotent on the contract side (mintFor reverts on duplicate
 * editionNumber), but we also short-circuit when isMinted is already true.
 */
import { encodeFunctionData } from "viem";
import {
  getAgentAddress,
  sendTx,
} from "../../../shared/wallet-client.js";
import { POOTER_API_URL } from "../config.js";

const AGENT_ID = "pooter1";

const MINT_FOR_ABI = [
  {
    type: "function",
    name: "mintFor",
    inputs: [
      { name: "to", type: "address" },
      { name: "editionNumber", type: "uint256" },
      { name: "contentHash", type: "bytes32" },
      { name: "dailyTitle", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

interface MintPayload {
  tokenId: number;
  contentHash: `0x${string}`;
  dailyTitle: string;
  editionsAddress: `0x${string}`;
  isMinted: boolean;
  owner: string | null;
  chainId: number;
}

async function fetchMintPayload(): Promise<MintPayload> {
  const url = `${POOTER_API_URL.replace(/\/+$/, "")}/api/editorial/today/mint-payload`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`mint-payload ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as MintPayload;
}

export async function mintDailyEdition(): Promise<{
  status: "minted" | "already-minted" | "skipped";
  tokenId?: number;
  txHash?: string;
  to?: string;
  reason?: string;
}> {
  const payload = await fetchMintPayload();

  if (payload.isMinted) {
    console.log(
      `[pooter1:mint] Edition #${payload.tokenId} already minted (owner=${payload.owner}) — skipping`,
    );
    return { status: "already-minted", tokenId: payload.tokenId };
  }

  const { address: scwAddress } = await getAgentAddress(AGENT_ID);
  console.log(`[pooter1:mint] smart wallet ${scwAddress} minting edition #${payload.tokenId}`);

  const data = encodeFunctionData({
    abi: MINT_FOR_ABI,
    functionName: "mintFor",
    args: [
      scwAddress,
      BigInt(payload.tokenId),
      payload.contentHash,
      payload.dailyTitle,
    ],
  });

  const result = await sendTx({
    agentId: AGENT_ID,
    to: payload.editionsAddress,
    data,
    value: "0",
  });

  console.log(
    `[pooter1:mint] Minted #${payload.tokenId} "${payload.dailyTitle}" → ${result.txHash}`,
  );
  return {
    status: "minted",
    tokenId: payload.tokenId,
    txHash: result.txHash,
    to: scwAddress,
  };
}

// Allow running directly: `npx tsx src/tasks/mint-daily-edition.ts`
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] &&
  /mint-daily-edition\.(ts|js)$/.test(process.argv[1]);

if (invokedDirectly) {
  mintDailyEdition()
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("[pooter1:mint] failed:", err);
      process.exit(1);
    });
}
