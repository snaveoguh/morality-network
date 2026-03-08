import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";
import type { TraderExecutionConfig } from "./types";

export function createTraderClients(config: TraderExecutionConfig) {
  const account = privateKeyToAccount(config.privateKey);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(config.rpcUrl, { timeout: 12_000 }),
  });

  const walletClient = createWalletClient({
    chain: base,
    account,
    transport: http(config.rpcUrl, { timeout: 12_000 }),
  });

  return {
    account,
    address: account.address,
    publicClient,
    walletClient,
  };
}
