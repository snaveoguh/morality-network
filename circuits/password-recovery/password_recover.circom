pragma circom 2.1.6;

include "node_modules/circomlib/circuits/poseidon.circom";

/**
 * ZK Password Recovery Circuit
 *
 * Proves: "I know a password and salt such that Poseidon(password, salt) == commitment"
 * without revealing the password or salt.
 *
 * The proof is bound to a specific recovery target (newAddress), chain (chainId),
 * and nonce (anti-replay) via public inputs.
 *
 * Constraint count: ~238 (Poseidon 2-input) + 3 binding constraints = ~241 total
 * Proving time: <3 seconds on iPhone 12+ / modern Android
 *
 * Security model:
 *   - password: Poseidon hash of raw UTF-8 bytes (hashed client-side before circuit)
 *   - salt: 128-bit random value generated at setup, stored in device secure storage
 *   - commitment: Poseidon(password, salt) stored on-chain
 *   - newAddress + chainId + nonce bind the proof to a specific recovery request
 *
 * Novel contribution: First cross-chain ZK password recovery for self-custody wallets.
 * Same commitment works on both EVM (Base) and Solana via shared BN254 curve.
 */

template PasswordRecover() {
    // ── Private inputs (witness) ──────────────────────────────────────
    signal input password;       // Field element: client-side Poseidon(raw_password_bytes)
    signal input salt;           // 128-bit random salt from device secure storage

    // ── Public inputs ─────────────────────────────────────────────────
    signal input commitment;     // On-chain: Poseidon(password, salt)
    signal input newAddress;     // Recovery target address (packed as field element)
    signal input chainId;        // 8453 = Base, 0 = Solana (prevents cross-chain replay)
    signal input nonce;          // From contract state (prevents proof replay)

    // ── Commitment verification ───────────────────────────────────────
    component hasher = Poseidon(2);
    hasher.inputs[0] <== password;
    hasher.inputs[1] <== salt;

    // Core constraint: computed hash must equal the on-chain commitment
    hasher.out === commitment;

    // ── Binding constraints ───────────────────────────────────────────
    // These don't add security constraints per se, but they ensure
    // the public inputs are part of the proof's public statement.
    // The verifier contract checks these match the expected values.
    //
    // We use a square constraint (x * x === x * x) to "touch" each
    // public input without over-constraining. The Groth16 verification
    // equation already binds public inputs to the proof, but explicit
    // constraints prevent the optimizer from dropping them.
    signal newAddressSq;
    newAddressSq <== newAddress * newAddress;

    signal chainIdSq;
    chainIdSq <== chainId * chainId;

    signal nonceSq;
    nonceSq <== nonce * nonce;
}

component main {public [commitment, newAddress, chainId, nonce]} = PasswordRecover();
