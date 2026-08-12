import {
  generateMnemonic as bip39Generate,
  validateMnemonic as bip39Validate,
} from "@scure/bip39";
import { wordlist as english } from "@scure/bip39/wordlists/english";

/**
 * Root identity = a 12-word English BIP-39 mnemonic (128 bits of entropy).
 * Everything else — EVM account, Solana keypair, future chains — is derived
 * from it. The mnemonic itself must never leave the device that generated it.
 */

/** Generate a fresh 12-word English mnemonic. */
export function generateMnemonic(): string {
  return bip39Generate(english, 128);
}

/**
 * True iff the string is a valid English BIP-39 mnemonic (checksum included).
 * Tolerant of case and stray whitespace; never throws.
 */
export function validateMnemonic(mnemonic: string): boolean {
  if (typeof mnemonic !== "string") return false;
  const normalized = mnemonic.normalize("NFKD").trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return false;
  try {
    return bip39Validate(normalized, english);
  } catch {
    return false;
  }
}
