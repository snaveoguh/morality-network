import { http, type Address } from "viem";
import { base } from "viem/chains";
import { entryPoint07Address } from "viem/account-abstraction";
import { toKernelSmartAccount } from "permissionless/accounts";
import { createSmartAccountClient } from "permissionless";
import { smartWalletsEnabled, pimlicoUrl } from "./config";
import { basePublicClient, pimlicoBaseClient } from "./clients";
import { deriveAgentOwnerAccount } from "./owner-keys";
import type { AgentWallet } from "./types";

type KernelClient = Parameters<typeof toKernelSmartAccount>[0]["client"];

async function buildKernelAccount(agentId: string) {
  const owner = deriveAgentOwnerAccount(agentId);
  return toKernelSmartAccount({
    // viem's PublicClient and Kernel's expected Client diverge only on the
    // third generic (account-shape); runtime shape matches.
    client: basePublicClient() as KernelClient,
    owners: [owner],
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    version: "0.3.3",
  });
}

// Cheap read: derives owner EOA + counterfactual smart account address.
// Requires only AGENT_WALLETS_MASTER_SEED and BASE_MAINNET_RPC_URL — no
// Pimlico key needed. Safe to call from public endpoints.
const addressCache = new Map<string, Address>();
export async function getAgentAddress(agentId: string): Promise<Address> {
  if (!smartWalletsEnabled()) {
    throw new Error(
      "Base smart wallets disabled. Set BASE_SMART_WALLETS_ENABLED=true to enable."
    );
  }
  const cached = addressCache.get(agentId);
  if (cached) return cached;
  const account = await buildKernelAccount(agentId);
  addressCache.set(agentId, account.address);
  return account.address;
}

// Full wallet with sendTx. Requires PIMLICO_API_KEY in addition to the read
// requirements. Use this from agent code that needs to actually transact.
const walletCache = new Map<string, AgentWallet>();
export async function getOrCreateAgentWallet(agentId: string): Promise<AgentWallet> {
  if (!smartWalletsEnabled()) {
    throw new Error(
      "Base smart wallets disabled. Set BASE_SMART_WALLETS_ENABLED=true to enable."
    );
  }

  const cached = walletCache.get(agentId);
  if (cached) return cached;

  const account = await buildKernelAccount(agentId);
  const pimlico = pimlicoBaseClient();

  const smartClient = createSmartAccountClient({
    account,
    chain: base,
    bundlerTransport: http(pimlicoUrl(base.id)),
    paymaster: pimlico,
    userOperation: {
      estimateFeesPerGas: async () => (await pimlico.getUserOperationGasPrice()).fast,
    },
  });

  const wallet: AgentWallet = {
    agentId,
    address: account.address,
    async sendTx({ to, data, value }) {
      return smartClient.sendTransaction({ to, data: data ?? "0x", value: value ?? BigInt(0) });
    },
  };

  walletCache.set(agentId, wallet);
  addressCache.set(agentId, account.address);
  return wallet;
}
