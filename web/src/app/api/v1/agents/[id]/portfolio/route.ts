// GET /api/v1/agents/[id]/portfolio
//
// Read-only view of an agent SCW's holdings on Base. Public — same threat
// model as /wallet (address is already deterministic from agent id).
//
// Returns balances for ETH + a fixed allowlist (WETH, USDC). Extra tokens
// can be requested via repeated `?token=0x…` query params.

import { NextResponse } from "next/server";
import { isAddress, formatUnits, type Address } from "viem";
import { getAgentAddress, smartWalletsEnabled } from "@/lib/wallets";
import { isAgentId } from "@/lib/wallets/agent-ids";
import { basePublicClient } from "@/lib/wallets/clients";
import { BASE_ADDRESSES } from "@/lib/wallets/skills";

const ERC20_READ_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

interface TokenBalance {
  token: Address | "native";
  symbol: string;
  decimals: number;
  raw: string;
  formatted: string;
}

async function readErc20Balance(
  owner: Address,
  token: Address,
): Promise<TokenBalance | null> {
  const client = basePublicClient();
  try {
    const [raw, decimals, symbol] = (await Promise.all([
      client.readContract({
        address: token,
        abi: ERC20_READ_ABI,
        functionName: "balanceOf",
        args: [owner],
      }),
      client.readContract({
        address: token,
        abi: ERC20_READ_ABI,
        functionName: "decimals",
      }),
      client.readContract({
        address: token,
        abi: ERC20_READ_ABI,
        functionName: "symbol",
      }),
    ])) as [bigint, number, string];
    return {
      token,
      symbol,
      decimals: Number(decimals),
      raw: raw.toString(),
      formatted: formatUnits(raw, Number(decimals)),
    };
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isAgentId(id)) {
    return NextResponse.json({ error: "unknown agent" }, { status: 404 });
  }
  if (!smartWalletsEnabled()) {
    return NextResponse.json(
      { error: "smart wallets disabled", agentId: id },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const extraTokens = url.searchParams
    .getAll("token")
    .filter((t) => isAddress(t)) as Address[];

  const tokens = Array.from(
    new Set<Address>([
      BASE_ADDRESSES.weth,
      BASE_ADDRESSES.usdc,
      ...extraTokens,
    ]),
  );

  try {
    const address = await getAgentAddress(id);
    const client = basePublicClient();

    const [ethRaw, ...tokenBalances] = await Promise.all([
      client.getBalance({ address }),
      ...tokens.map((t) => readErc20Balance(address, t)),
    ]);

    const balances: TokenBalance[] = [
      {
        token: "native",
        symbol: "ETH",
        decimals: 18,
        raw: ethRaw.toString(),
        formatted: formatUnits(ethRaw, 18),
      },
      ...tokenBalances.filter((b): b is TokenBalance => b !== null),
    ];

    return NextResponse.json({
      agentId: id,
      address,
      chainId: 8453,
      balances,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, agentId: id }, { status: 500 });
  }
}
