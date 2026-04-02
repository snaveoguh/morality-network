// ─── Agent Core — Wallet Pool ───────────────────────────────────────────────
// HD wallet derivation for 67 agents. Each agent gets a unique, deterministic
// address derived from a single seed phrase (BIP44 m/44'/60'/0'/0/{index}).
// Private keys are NEVER cached — derived on demand and discarded.

import { mnemonicToAccount } from "viem/accounts";

const AGENT_COUNT = 67;

// Test mnemonic for dry-run mode. NEVER use on mainnet with real funds.
const TEST_MNEMONIC =
  "test test test test test test test test test test test junk";

export interface AgentWallet {
  index: number;
  address: string; // hex address (0x...)
}

function getSeedPhrase(): string {
  const seed = process.env.AGENT_SEED_PHRASE;
  if (seed) return seed;

  console.warn(
    "[WalletPool] AGENT_SEED_PHRASE not set — using test mnemonic (dry-run mode)"
  );
  return TEST_MNEMONIC;
}

export class WalletPool {
  private addressCache = new Map<number, string>();

  /** Derive the address for agent at `index` (BIP44 path: m/44'/60'/0'/0/{index}). */
  deriveAddress(index: number): string {
    const cached = this.addressCache.get(index);
    if (cached) return cached;

    const account = mnemonicToAccount(getSeedPhrase(), {
      addressIndex: index,
    });
    const addr = account.address;
    this.addressCache.set(index, addr);
    return addr;
  }

  /**
   * Derive private key for agent at `index`. NEVER cache the result —
   * callers should use it immediately and let it be garbage collected.
   */
  derivePrivateKey(index: number): string {
    const account = mnemonicToAccount(getSeedPhrase(), {
      addressIndex: index,
    });
    // viem's LocalAccount from mnemonicToAccount does not directly expose the
    // private key as a hex string, but the underlying HDKey is used internally.
    // We re-derive via the same path to get the signing key.
    // mnemonicToAccount returns an account with a `signMessage` etc., but for
    // raw key access we need to go through the source property.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const source = (account as any).source;
    if (source && typeof source === "string") return source;

    // Fallback: re-derive using viem's internal HDKey approach.
    // The account object itself can sign — callers should prefer using the
    // account directly via getSigningAccount() rather than extracting raw keys.
    throw new Error(
      "[WalletPool] Cannot extract raw private key from mnemonicToAccount. " +
        "Use getSigningAccount(index) instead for signing operations."
    );
  }

  /**
   * Get a viem LocalAccount suitable for signing transactions.
   * Prefer this over derivePrivateKey() — avoids raw key exposure.
   */
  getSigningAccount(index: number) {
    return mnemonicToAccount(getSeedPhrase(), {
      addressIndex: index,
    });
  }

  /** Return addresses for all 67 agents. */
  getAllAddresses(): AgentWallet[] {
    const wallets: AgentWallet[] = [];
    for (let i = 0; i < AGENT_COUNT; i++) {
      wallets.push({ index: i, address: this.deriveAddress(i) });
    }
    return wallets;
  }

  /**
   * Get wallet for an agent by ID. Expects IDs that end with a numeric index
   * (e.g. "agent-0", "scanner-12") or are purely numeric.
   */
  getAgentWallet(agentId: string): AgentWallet {
    const match = agentId.match(/(\d+)$/);
    const index = match ? parseInt(match[1], 10) : 0;
    return { index, address: this.deriveAddress(index) };
  }
}

/** Singleton wallet pool. */
export const walletPool = new WalletPool();
