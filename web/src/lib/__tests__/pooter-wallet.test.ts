import { describe, expect, it } from "vitest";

import { Keypair, PublicKey } from "@solana/web3.js";
import { mnemonicToAccount } from "viem/accounts";

import { deriveEvmAccount, deriveSolanaKeypair, validateMnemonic } from "@pooter/wallet";

/**
 * Cross-checks @pooter/wallet against the independent implementations already
 * in web/'s dependency tree. The package's own unit tests live in
 * packages/wallet/src/__tests__ (also run by this vitest config).
 */

const TEST_MNEMONIC = "test test test test test test test test test test test junk";

describe("@pooter/wallet integration", () => {
  it("EVM derivation matches viem's mnemonicToAccount at every index", () => {
    for (const index of [0, 1, 7]) {
      expect(deriveEvmAccount(TEST_MNEMONIC, index).address).toBe(
        mnemonicToAccount(TEST_MNEMONIC, { addressIndex: index }).address,
      );
    }
  });

  it("Solana secretKey round-trips through @solana/web3.js to the same address", () => {
    const derived = deriveSolanaKeypair(TEST_MNEMONIC);
    const keypair = Keypair.fromSecretKey(derived.secretKey);
    // web3.js recomputes the public key from the secret key — if our base58,
    // slip10 or ed25519 wiring were off, these would disagree.
    expect(keypair.publicKey.toBase58()).toBe(derived.publicKey);
    expect(new PublicKey(derived.publicKey).toBytes()).toEqual(derived.publicKeyBytes);
  });

  it("validates the mnemonics the WalletSetup flow produces", () => {
    expect(validateMnemonic(TEST_MNEMONIC)).toBe(true);
  });
});
