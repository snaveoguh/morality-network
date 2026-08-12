import { ed25519 } from "@noble/curves/ed25519";
import { mnemonicToSeedSync } from "@scure/bip39";

import { base58Encode } from "./base58";
import { slip10Ed25519Derive } from "./slip10";

/**
 * Solana keypair at m/44'/501'/0'/0' (SLIP-0010 ed25519, all segments
 * hardened) — the path Phantom/Solflare use for account 0, so the same
 * mnemonic imports to the same address in mainstream wallets.
 */

const SOLANA_PATH = [44, 501, 0, 0]; // hardening applied by slip10Ed25519Derive

export interface SolanaKeypair {
  /** Base58 public key — the Solana address. */
  publicKey: string;
  /** Raw 32-byte public key. */
  publicKeyBytes: Uint8Array;
  /** 64-byte secret key (seed ‖ publicKey) — the format @solana/web3.js `Keypair.fromSecretKey` expects. */
  secretKey: Uint8Array;
}

export function deriveSolanaKeypair(mnemonic: string): SolanaKeypair {
  const seed = mnemonicToSeedSync(mnemonic); // empty passphrase, 64 bytes
  const privateSeed = slip10Ed25519Derive(seed, SOLANA_PATH);
  const publicKeyBytes = ed25519.getPublicKey(privateSeed);

  const secretKey = new Uint8Array(64);
  secretKey.set(privateSeed, 0);
  secretKey.set(publicKeyBytes, 32);

  return {
    publicKey: base58Encode(publicKeyBytes),
    publicKeyBytes,
    secretKey,
  };
}
