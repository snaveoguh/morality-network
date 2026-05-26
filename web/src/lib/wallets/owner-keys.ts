import { hkdfSync } from "node:crypto";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { requireMasterSeedHex } from "./config";

// Deterministic per-agent EOA owner. Same agentId always derives the same
// private key from the master seed. Key material lives only in memory and is
// never returned outside this module — only the viem account object is exposed.
export function deriveAgentOwnerAccount(agentId: string): PrivateKeyAccount {
  if (!agentId || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(agentId)) {
    throw new Error(`Invalid agentId: ${agentId}`);
  }

  const seed = Buffer.from(requireMasterSeedHex(), "hex");
  const info = Buffer.from(`pooter:agent-owner:v1:${agentId}`, "utf8");
  const derived = hkdfSync("sha256", seed, Buffer.alloc(0), info, 32);
  const pk = `0x${Buffer.from(derived).toString("hex")}` as `0x${string}`;
  return privateKeyToAccount(pk);
}
