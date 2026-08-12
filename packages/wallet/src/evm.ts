import { mnemonicToAccount } from "viem/accounts";
import type { HDAccount } from "viem";

/**
 * Derive the EVM account at m/44'/60'/0'/0/{index}.
 *
 * Returns a viem LocalAccount (HDAccount): it can sign messages, typed data
 * and transactions entirely locally. The private key never needs to be
 * extracted — pass the account object to viem clients directly.
 */
export function deriveEvmAccount(mnemonic: string, index = 0): HDAccount {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`deriveEvmAccount: index must be a non-negative integer, got ${index}`);
  }
  // viem's default path is m/44'/60'/${accountIndex}'/0/${addressIndex} with
  // accountIndex = 0 — exactly the contract path.
  return mnemonicToAccount(mnemonic, { addressIndex: index });
}
