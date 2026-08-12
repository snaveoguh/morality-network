/**
 * ZK Password Recovery — NOT IMPLEMENTED.
 *
 * ============================================================================
 * WARNING: there is no ZK recovery. Nothing in this file (or anywhere else in
 * the app) generates a zero-knowledge proof, registers a commitment on-chain,
 * or enforces a timelock. The previous version of this module computed a
 * SHA-256 "commitment" that was never submitted anywhere, and the UI around it
 * fabricated transaction hashes with setTimeout. All of that UI has been
 * removed from onboarding and settings as of v1.
 *
 * This file is kept as the future home of the real implementation:
 *   - Poseidon commitment (circomlibjs) over password + salt
 *   - Groth16 proof via snarkjs with bundled WASM + zkey assets
 *   - ZKRecovery.registerCommitment / initiateRecovery / executeRecovery on Base
 *
 * Do NOT wire any UI to these exports until the contract is deployed and the
 * proof pipeline actually exists. Until then, seed-phrase backup is the only
 * recovery path, and the app must say so honestly.
 * ============================================================================
 */

export const ZK_RECOVERY_IMPLEMENTED = false;

export async function setupRecovery(_recoveryPassword: string): Promise<never> {
  throw new Error('ZK recovery is not implemented');
}

export async function initiateRecovery(
  _recoveryPassword: string,
  _salt: string,
  _newEvmAddress: string,
): Promise<never> {
  throw new Error('ZK recovery is not implemented');
}
