import type { Address, Hex } from "viem";

export interface AgentWallet {
  readonly agentId: string;
  readonly address: Address;
  sendTx(params: { to: Address; data?: Hex; value?: bigint }): Promise<Hex>;
}
