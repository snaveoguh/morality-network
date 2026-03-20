import { createPublicClient, http, isAddress, type Address } from "viem";
import { base, baseSepolia } from "viem/chains";
import {
  AGENT_VAULT_ABI,
  AGENT_VAULT_ADDRESS,
  AGENT_VAULT_CHAIN_ID,
  ZERO_ADDRESS,
} from "./contracts";

const USE_SEPOLIA = AGENT_VAULT_CHAIN_ID === baseSepolia.id;
const vaultChain = USE_SEPOLIA ? baseSepolia : base;
const defaultRpcUrl = USE_SEPOLIA
  ? process.env.BASE_SEPOLIA_RPC_URL ||
    process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ||
    "https://sepolia.base.org"
  : process.env.BASE_MAINNET_RPC_URL ||
    process.env.NEXT_PUBLIC_BASE_MAINNET_RPC_URL ||
    "https://mainnet.base.org";

const VAULT_RPC_URL = process.env.AGENT_VAULT_RPC_URL || defaultRpcUrl;

const vaultClient = createPublicClient({
  chain: vaultChain,
  transport: http(VAULT_RPC_URL, { timeout: 10_000 }),
});

export interface VaultFunderSnapshot {
  address: Address;
  shares: string;
  equityWei: string;
  depositedWei: string;
  withdrawnWei: string;
  pnlWei: string;
  pnlBps: string;
}

export interface VaultOverview {
  enabled: true;
  chainId: number;
  address: Address;
  manager: Address;
  feeRecipient: Address;
  performanceFeeBps: number;
  totalManagedAssetsWei: string;
  liquidAssetsWei: string;
  deployedCapitalWei: string;
  totalShares: string;
  sharePriceE18: string;
  cumulativeStrategyProfitWei: string;
  cumulativeStrategyLossWei: string;
  totalFeesPaidWei: string;
  funderCount: number;
  funders: VaultFunderSnapshot[];
  account: VaultFunderSnapshot | null;
}

function isVaultConfigured(): boolean {
  return (
    isAddress(AGENT_VAULT_ADDRESS) &&
    AGENT_VAULT_ADDRESS.toLowerCase() !== ZERO_ADDRESS.toLowerCase()
  );
}

async function readFunderSnapshot(
  funder: Address
): Promise<VaultFunderSnapshot> {
  const snapshot = await vaultClient.readContract({
    address: AGENT_VAULT_ADDRESS,
    abi: AGENT_VAULT_ABI,
    functionName: "getFunderSnapshot",
    args: [funder],
  });

  // ABI returns tuple: [shares, equityAssets, deposited, withdrawn, pnl, pnlBps]
  const [shares, equityAssets, deposited, withdrawn, pnl, pnlBps] = snapshot;

  return {
    address: funder,
    shares: shares.toString(),
    equityWei: equityAssets.toString(),
    depositedWei: deposited.toString(),
    withdrawnWei: withdrawn.toString(),
    pnlWei: pnl.toString(),
    pnlBps: pnlBps.toString(),
  };
}

export async function fetchVaultOverview(options?: {
  limit?: number;
  account?: Address | null;
  includeFunders?: boolean;
  includeAccount?: boolean;
}): Promise<VaultOverview | null> {
  if (!isVaultConfigured()) {
    return null;
  }

  const limit = Math.min(Math.max(Math.trunc(options?.limit ?? 50), 1), 200);
  const account = options?.account ?? null;
  const includeFunders = options?.includeFunders ?? true;
  const includeAccount = options?.includeAccount ?? true;

  try {
    const state = await vaultClient.readContract({
      address: AGENT_VAULT_ADDRESS,
      abi: AGENT_VAULT_ABI,
      functionName: "getVaultState",
    });

    // ABI returns tuple: [totalManagedAssets_, liquidAssets_, deployedCapital_,
    //   totalShares_, sharePriceE18_, performanceFeeBps_, manager_, feeRecipient_,
    //   cumulativeStrategyProfit_, cumulativeStrategyLoss_, totalFeesPaid_, funderCount_]
    const [
      totalManagedAssets, liquidAssets, deployedCapital,
      totalShares, sharePriceE18, performanceFeeBps,
      manager, feeRecipient,
      cumulativeStrategyProfit, cumulativeStrategyLoss, totalFeesPaid, funderCount,
    ] = state;

    const funders = includeFunders
      ? await (async () => {
          const funderAddresses = await vaultClient.readContract({
            address: AGENT_VAULT_ADDRESS,
            abi: AGENT_VAULT_ABI,
            functionName: "getFunders",
            args: [BigInt(0), BigInt(limit)],
          });
          return Promise.all(
            funderAddresses.map((funder) => readFunderSnapshot(funder as Address))
          );
        })()
      : [];

    const accountSnapshot =
      includeAccount && account && isAddress(account)
        ? await readFunderSnapshot(account)
        : null;

    return {
      enabled: true,
      chainId: AGENT_VAULT_CHAIN_ID,
      address: AGENT_VAULT_ADDRESS,
      manager: manager as Address,
      feeRecipient: feeRecipient as Address,
      performanceFeeBps: Number(performanceFeeBps),
      totalManagedAssetsWei: totalManagedAssets.toString(),
      liquidAssetsWei: liquidAssets.toString(),
      deployedCapitalWei: deployedCapital.toString(),
      totalShares: totalShares.toString(),
      sharePriceE18: sharePriceE18.toString(),
      cumulativeStrategyProfitWei: cumulativeStrategyProfit.toString(),
      cumulativeStrategyLossWei: cumulativeStrategyLoss.toString(),
      totalFeesPaidWei: totalFeesPaid.toString(),
      funderCount: Number(funderCount),
      funders,
      account: accountSnapshot,
    };
  } catch (error) {
    console.error("[Vault] Failed to fetch overview:", error);
    return null;
  }
}
