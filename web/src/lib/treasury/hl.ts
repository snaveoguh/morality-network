// Hyperliquid → Arbitrum L1 withdraw. Wraps the @nktkas/hyperliquid SDK's
// `withdraw3` action. Destination defaults to the wallet's own address
// (the operator EOA, AGENT_PRIVATE_KEY). HL takes a small fee (~$1) on
// withdrawals; net amount lands on Arbitrum after ~4 minutes.

import type { Address } from "viem";
import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";

const HL_API_URL = "https://api.hyperliquid.xyz";
// Documented HL withdrawal fee — confirm against the gitbook before assuming
// it has not changed. Conservative buffer.
export const HL_WITHDRAW_FEE_USD = 1;

function getOperatorKey(): `0x${string}` {
  const raw = process.env.AGENT_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!raw) throw new Error("AGENT_PRIVATE_KEY not set");
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
}

function getClients() {
  const wallet = privateKeyToAccount(getOperatorKey());
  const transport = new HttpTransport({ apiUrl: HL_API_URL, isTestnet: false, timeout: 8_000 });
  return {
    wallet,
    info: new InfoClient({ transport }),
    exchange: new ExchangeClient({ transport, wallet }),
  };
}

export interface HlBalance {
  operatorAddress: Address;
  perpAccountValueUsd: number;
  spotUsdcBalance: number;
  totalUsd: number;
}

export async function getHlBalance(): Promise<HlBalance> {
  const { wallet, info } = getClients();
  const address = wallet.address as `0x${string}`;

  let perp = 0;
  try {
    const state = await info.clearinghouseState({ user: address });
    const v = state.marginSummary?.accountValue ?? state.crossMarginSummary?.accountValue;
    perp = v ? Number(v) : 0;
  } catch {
    perp = 0;
  }

  let spot = 0;
  try {
    const state = await info.spotClearinghouseState({ user: address });
    const usdc = state.balances?.find((b: { coin?: string; total?: string }) => b.coin === "USDC");
    spot = usdc?.total ? Number(usdc.total) : 0;
  } catch {
    spot = 0;
  }

  return {
    operatorAddress: address,
    perpAccountValueUsd: perp,
    spotUsdcBalance: spot,
    totalUsd: perp + spot,
  };
}

export interface WithdrawResult {
  status: "ok" | "dry-run";
  destination: Address;
  amountUsd: number;
  estimatedFeeUsd: number;
  netAmountUsd: number;
  response?: unknown;
  prepared?: {
    type: "withdraw3";
    destination: Address;
    amount: string;
  };
}

export async function executeHlWithdraw(args: {
  amountUsd: number;
  destination?: Address;
  dryRun?: boolean;
}): Promise<WithdrawResult> {
  if (!Number.isFinite(args.amountUsd) || args.amountUsd <= 0) {
    throw new Error("amountUsd must be positive");
  }
  if (args.amountUsd < HL_WITHDRAW_FEE_USD * 2) {
    throw new Error(`amountUsd must exceed 2× fee (${HL_WITHDRAW_FEE_USD * 2})`);
  }

  const { wallet, exchange } = getClients();
  const destination = (args.destination ?? wallet.address) as Address;
  const amount = args.amountUsd.toFixed(6);

  const prepared = { type: "withdraw3" as const, destination, amount };

  if (args.dryRun) {
    return {
      status: "dry-run",
      destination,
      amountUsd: args.amountUsd,
      estimatedFeeUsd: HL_WITHDRAW_FEE_USD,
      netAmountUsd: args.amountUsd - HL_WITHDRAW_FEE_USD,
      prepared,
    };
  }

  const response = await exchange.withdraw3({ destination, amount });

  return {
    status: "ok",
    destination,
    amountUsd: args.amountUsd,
    estimatedFeeUsd: HL_WITHDRAW_FEE_USD,
    netAmountUsd: args.amountUsd - HL_WITHDRAW_FEE_USD,
    response,
  };
}
