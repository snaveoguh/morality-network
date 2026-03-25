/**
 * ZK Password Recovery — Cross-platform proof generation library
 *
 * This module provides:
 *   - computeCommitment(password, salt) → Poseidon hash for on-chain storage
 *   - generateRecoveryProof(input) → Groth16 proof for on-chain verification
 *   - generateSalt() → Cryptographically secure 128-bit random salt
 *   - formatProofForContract() → Format proof for Solidity calldata
 *
 * Works in both React Native (Hermes engine) and browser environments.
 * Uses snarkjs for proof generation and circomlibjs for Poseidon hashing.
 *
 * @example
 * ```typescript
 * import { computeCommitment, generateRecoveryProof, generateSalt } from '@pooter/sdk/zk-recovery';
 *
 * // Setup (during wallet onboarding)
 * const salt = generateSalt();
 * const commitment = await computeCommitment("my-recovery-password", salt);
 * // Store salt locally, submit commitment on-chain
 *
 * // Recovery (on new device)
 * const proof = await generateRecoveryProof({
 *   password: "my-recovery-password",
 *   salt: savedSalt,
 *   commitment: onChainCommitment,
 *   newAddress: "0xNewWalletAddress",
 *   chainId: 8453, // Base
 *   nonce: 0,       // From contract state
 * });
 * // Submit proof to initiateRecovery() on-chain
 * ```
 */

// NOTE: These imports require `npm install snarkjs circomlibjs`
// For React Native, snarkjs needs WASM support (Hermes 0.74+ supports it)
// @ts-ignore — snarkjs types are incomplete
import * as snarkjs from 'snarkjs';
// @ts-ignore
import { buildPoseidon } from 'circomlibjs';

// ═══════════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════════

export interface RecoveryProofInput {
  /** Raw user password (UTF-8 string) */
  password: string;
  /** 128-bit random salt from device secure storage */
  salt: bigint;
  /** On-chain commitment (for verification, not used in circuit directly) */
  commitment: bigint;
  /** Target recovery address (EVM hex or Solana base58) */
  newAddress: string;
  /** Chain ID: 8453 for Base, 0 for Solana */
  chainId: number;
  /** Current nonce from on-chain contract state */
  nonce: number;
}

export interface Groth16Proof {
  /** Proof point A (G1) */
  pA: [string, string];
  /** Proof point B (G2) */
  pB: [[string, string], [string, string]];
  /** Proof point C (G1) */
  pC: [string, string];
  /** Public signals: [commitment, newAddress, chainId, nonce] */
  publicSignals: string[];
}

export interface SolidityCalldata {
  pA: [bigint, bigint];
  pB: [[bigint, bigint], [bigint, bigint]];
  pC: [bigint, bigint];
  pubSignals: [bigint, bigint, bigint, bigint];
}

// ═══════════════════════════════════════════════════════════════════
//  Circuit Asset Paths
// ═══════════════════════════════════════════════════════════════════

// These paths are relative to the bundled assets.
// In React Native, use expo-asset to resolve them.
// In browser/extension, serve from /public/ or extension bundle.
const WASM_PATH = 'circuits/password_recover_js/password_recover.wasm';
const ZKEY_PATH = 'circuits/password_recover_final.zkey';

// Allow overriding paths at runtime (for RN asset resolution)
let wasmPathOverride: string | undefined;
let zkeyPathOverride: string | undefined;

export function setCircuitPaths(wasm: string, zkey: string): void {
  wasmPathOverride = wasm;
  zkeyPathOverride = zkey;
}

// ═══════════════════════════════════════════════════════════════════
//  Core Functions
// ═══════════════════════════════════════════════════════════════════

let poseidonInstance: any = null;

async function getPoseidon() {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

/**
 * Hash a raw UTF-8 password string into a field element using Poseidon.
 * This is done client-side before the password enters the circuit,
 * avoiding variable-length string handling in the arithmetic circuit.
 */
async function hashPassword(password: string): Promise<bigint> {
  const poseidon = await getPoseidon();
  // Convert password to bytes, then to a single field element
  const encoder = new TextEncoder();
  const bytes = encoder.encode(password);

  // Split into 31-byte chunks (BN254 field is ~254 bits)
  const chunks: bigint[] = [];
  for (let i = 0; i < bytes.length; i += 31) {
    const chunk = bytes.slice(i, Math.min(i + 31, bytes.length));
    let val = BigInt(0);
    for (let j = 0; j < chunk.length; j++) {
      val = (val << BigInt(8)) | BigInt(chunk[j]);
    }
    chunks.push(val);
  }

  // Hash all chunks together with Poseidon
  // If password fits in one chunk, hash it directly
  if (chunks.length === 0) chunks.push(BigInt(0));

  const hash = poseidon(chunks);
  return poseidon.F.toObject(hash);
}

/**
 * Compute the Poseidon commitment: Poseidon(hashPassword(password), salt)
 * This is what gets stored on-chain.
 */
export async function computeCommitment(
  password: string,
  salt: bigint,
): Promise<bigint> {
  const poseidon = await getPoseidon();
  const passwordHash = await hashPassword(password);
  const commitment = poseidon([passwordHash, salt]);
  return poseidon.F.toObject(commitment);
}

/**
 * Generate a cryptographically secure 128-bit random salt.
 */
export function generateSalt(): bigint {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let salt = BigInt(0);
  for (let i = 0; i < 16; i++) {
    salt = (salt << BigInt(8)) | BigInt(bytes[i]);
  }
  return salt;
}

/**
 * Generate a Groth16 ZK proof for wallet recovery.
 *
 * This proves: "I know password and salt such that Poseidon(password, salt) == commitment"
 * without revealing password or salt.
 *
 * The proof is bound to a specific newAddress, chainId, and nonce via public inputs,
 * preventing replay attacks, cross-chain transplant, and front-running.
 *
 * @param input - Recovery proof parameters
 * @returns Groth16 proof ready for on-chain verification
 */
export async function generateRecoveryProof(
  input: RecoveryProofInput,
): Promise<Groth16Proof> {
  const passwordHash = await hashPassword(input.password);

  // Convert address to field element
  let addressField: bigint;
  if (input.newAddress.startsWith('0x')) {
    // EVM address
    addressField = BigInt(input.newAddress);
  } else {
    // Solana address (base58) — hash to fit in field
    const encoder = new TextEncoder();
    const bytes = encoder.encode(input.newAddress);
    addressField = BigInt(0);
    for (let i = 0; i < Math.min(bytes.length, 31); i++) {
      addressField = (addressField << BigInt(8)) | BigInt(bytes[i]);
    }
  }

  const circuitInput = {
    // Private inputs
    password: passwordHash.toString(),
    salt: input.salt.toString(),
    // Public inputs
    commitment: input.commitment.toString(),
    newAddress: addressField.toString(),
    chainId: input.chainId.toString(),
    nonce: input.nonce.toString(),
  };

  const wasm = wasmPathOverride || WASM_PATH;
  const zkey = zkeyPathOverride || ZKEY_PATH;

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    wasm,
    zkey,
  );

  return {
    pA: proof.pi_a.slice(0, 2),
    pB: proof.pi_b.slice(0, 2),
    pC: proof.pi_c.slice(0, 2),
    publicSignals,
  };
}

/**
 * Format a Groth16 proof for Solidity contract calldata.
 * Returns values ready to pass to ZKRecovery.initiateRecovery().
 */
export async function formatProofForContract(
  proof: Groth16Proof,
): Promise<SolidityCalldata> {
  const calldataStr = await snarkjs.groth16.exportSolidityCallData(
    {
      pi_a: [...proof.pA, '1'],
      pi_b: [...proof.pB, [['1', '0'], ['0', '1']]],
      pi_c: [...proof.pC, '1'],
      protocol: 'groth16',
    },
    proof.publicSignals,
  );

  // Parse the calldata string
  const argv = calldataStr
    .replace(/["[\]\s]/g, '')
    .split(',')
    .map((x: string) => BigInt(x));

  return {
    pA: [argv[0], argv[1]],
    pB: [
      [argv[2], argv[3]],
      [argv[4], argv[5]],
    ],
    pC: [argv[6], argv[7]],
    pubSignals: [argv[8], argv[9], argv[10], argv[11]],
  };
}

/**
 * Format a Groth16 proof as bytes for Solana program (256 bytes).
 * Serializes pi_a (64 bytes) + pi_b (128 bytes) + pi_c (64 bytes).
 */
export function formatProofForSolana(proof: Groth16Proof): Uint8Array {
  const buffer = new Uint8Array(256);
  let offset = 0;

  // Helper: write a bigint as 32 bytes (big-endian)
  function writeBigInt(val: string) {
    const bi = BigInt(val);
    for (let i = 31; i >= 0; i--) {
      buffer[offset + i] = Number(bi & BigInt(0xff));
      // eslint-disable-next-line no-param-reassign
    }
    offset += 32;
  }

  // pi_a: 2 x 32 bytes
  writeBigInt(proof.pA[0]);
  writeBigInt(proof.pA[1]);

  // pi_b: 2 x 2 x 32 bytes
  writeBigInt(proof.pB[0][0]);
  writeBigInt(proof.pB[0][1]);
  writeBigInt(proof.pB[1][0]);
  writeBigInt(proof.pB[1][1]);

  // pi_c: 2 x 32 bytes
  writeBigInt(proof.pC[0]);
  writeBigInt(proof.pC[1]);

  return buffer;
}

/**
 * Verify a proof locally (for debugging / pre-flight check).
 * Uses the verification key JSON exported from the circuit build.
 */
export async function verifyProofLocally(
  proof: Groth16Proof,
  vkeyJson: any,
): Promise<boolean> {
  return snarkjs.groth16.verify(
    vkeyJson,
    proof.publicSignals,
    {
      pi_a: [...proof.pA, '1'],
      pi_b: [...proof.pB, [['1', '0'], ['0', '1']]],
      pi_c: [...proof.pC, '1'],
      protocol: 'groth16',
    },
  );
}
