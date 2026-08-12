/**
 * @pooter/wallet — Identity Contract v1.
 *
 * Root identity is a 12-word BIP-39 mnemonic. This package is pure TypeScript
 * with no platform storage and no network access: generation, derivation and
 * encryption all happen wherever the caller runs it (browser, extension,
 * mobile). A mnemonic passed to these functions must never be transmitted.
 *
 * Derivation paths:
 *   EVM     m/44'/60'/0'/0/{index}   (viem HDAccount)
 *   Solana  m/44'/501'/0'/0'         (SLIP-0010 ed25519, Phantom-compatible)
 */

export { generateMnemonic, validateMnemonic } from "./mnemonic";
export { deriveEvmAccount } from "./evm";
export { deriveSolanaKeypair, type SolanaKeypair } from "./solana";
export {
  encryptMnemonic,
  decryptMnemonic,
  PBKDF2_ITERATIONS,
  type EncryptedMnemonicV1,
} from "./crypto";
