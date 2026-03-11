import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, http } from "viem";
import { base, mainnet } from "viem/chains";
import type { TraderExecutionConfig } from "./types";

export function createTraderClients(config: TraderExecutionConfig) {
  const account = privateKeyToAccount(config.privateKey);
  const chain = config.executionVenue === "ethereum-spot" ? mainnet : base;

  const publicClient = createPublicClient({
    chain,
    transport: http(config.rpcUrl, { timeout: 12_000 }),
  });

  const walletClient = createWalletClient({
    chain,
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
