/**
 * ZK Password Recovery — Mobile wrapper
 *
 * Wraps the SDK's ZK functions with local storage for salt + commitment,
 * and provides high-level setup/recover flows for the onboarding UI.
 */
import * as SecureStore from 'expo-secure-store';
import { getEvmAddress, getSolanaAddress } from './wallet';

// ── Storage keys ──────────────────────────────────────────────────────
const STORE_ZK_SALT = 'pw_zk_salt';
const STORE_ZK_COMMITMENT = 'pw_zk_commitment';
const STORE_ZK_SETUP_DONE = 'pw_zk_setup';

// ── Types ─────────────────────────────────────────────────────────────

export interface ZKSetupResult {
  commitment: string;
  salt: string;
  evmAddress: string;
  solanaAddress: string;
}

export interface ZKRecoveryResult {
  proofHex: string;
  publicSignals: string[];
  newAddress: string;
}

// ── Status ────────────────────────────────────────────────────────────

export async function isZKRecoverySetup(): Promise<boolean> {
  const val = await SecureStore.getItemAsync(STORE_ZK_SETUP_DONE);
  return val === 'true';
}

export async function getStoredSalt(): Promise<string | null> {
  return SecureStore.getItemAsync(STORE_ZK_SALT);
}

export async function getStoredCommitment(): Promise<string | null> {
  return SecureStore.getItemAsync(STORE_ZK_COMMITMENT);
}

// ── Setup Flow ────────────────────────────────────────────────────────

/**
 * Set up ZK recovery during wallet onboarding.
 *
 * 1. Generates a random salt
 * 2. Computes Poseidon commitment = H(H(password), salt)
 * 3. Stores salt in SecureStore (device keychain)
 * 4. Returns commitment for on-chain registration
 *
 * The commitment should be submitted to:
 *   - Base: ZKRecovery.registerCommitment(commitment)
 *   - Solana: initiate_zk_recovery with commitment
 */
export async function setupRecovery(
  recoveryPassword: string,
): Promise<ZKSetupResult> {
  if (!recoveryPassword || recoveryPassword.length < 8) {
    throw new Error('Recovery password must be at least 8 characters');
  }

  // Generate salt — 128-bit random
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  let salt = BigInt(0);
  for (let i = 0; i < 16; i++) {
    salt = (salt << BigInt(8)) | BigInt(saltBytes[i]);
  }

  // Compute commitment using simple hash (Poseidon requires WASM)
  // In production: use snarkjs/circomlibjs Poseidon
  // For now: hash password + salt → keccak-like commitment
  const commitment = await computeSimpleCommitment(recoveryPassword, salt);

  // Store securely
  await SecureStore.setItemAsync(STORE_ZK_SALT, salt.toString());
  await SecureStore.setItemAsync(STORE_ZK_COMMITMENT, commitment);
  await SecureStore.setItemAsync(STORE_ZK_SETUP_DONE, 'true');

  const evmAddress = getEvmAddress() || '';
  const solanaAddress = getSolanaAddress() || '';

  return {
    commitment,
    salt: salt.toString(),
    evmAddress,
    solanaAddress,
  };
}

/**
 * Simple commitment for MVP — will be replaced with Poseidon
 * when WASM circuit assets are bundled into the app.
 *
 * Uses SHA-256(password || salt) as a placeholder.
 * The on-chain contract must use matching hash for verification.
 */
async function computeSimpleCommitment(
  password: string,
  salt: bigint,
): Promise<string> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  const saltStr = salt.toString(16).padStart(32, '0');
  const saltBytesArr = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    saltBytesArr[i] = parseInt(saltStr.slice(i * 2, i * 2 + 2), 16);
  }

  const combined = new Uint8Array(passwordBytes.length + saltBytesArr.length);
  combined.set(passwordBytes);
  combined.set(saltBytesArr, passwordBytes.length);

  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  const hashArray = new Uint8Array(hashBuffer);
  return '0x' + Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Recovery Flow ─────────────────────────────────────────────────────

/**
 * Initiate recovery on a NEW device (user has lost access to original).
 *
 * The user provides:
 *   - Their recovery password
 *   - Their salt (exported previously, or from backup)
 *   - The new wallet address to recover to
 *
 * This generates a ZK proof and returns it for on-chain submission.
 *
 * In production, this will use snarkjs.groth16.fullProve() with
 * the bundled WASM + zkey circuit assets.
 */
export async function initiateRecovery(
  recoveryPassword: string,
  salt: string,
  newEvmAddress: string,
): Promise<ZKRecoveryResult> {
  if (!recoveryPassword || recoveryPassword.length < 8) {
    throw new Error('Recovery password must be at least 8 characters');
  }

  // Recompute commitment to verify password is correct
  const commitment = await computeSimpleCommitment(
    recoveryPassword,
    BigInt(salt),
  );

  // In production: generate Groth16 proof via snarkjs
  // For MVP: return the commitment for server-side verification
  return {
    proofHex: commitment, // placeholder — real proof when circuits are bundled
    publicSignals: [commitment, newEvmAddress, '8453', '0'],
    newAddress: newEvmAddress,
  };
}

// ── Export Salt (for backup) ──────────────────────────────────────────

/**
 * Export the ZK salt for the user to back up.
 * This is needed alongside the recovery password to recover.
 */
export async function exportRecoverySalt(): Promise<string | null> {
  return SecureStore.getItemAsync(STORE_ZK_SALT);
}

/**
 * Clear ZK recovery data (when wallet is deleted).
 */
export async function clearRecoveryData(): Promise<void> {
  await SecureStore.deleteItemAsync(STORE_ZK_SALT);
  await SecureStore.deleteItemAsync(STORE_ZK_COMMITMENT);
  await SecureStore.deleteItemAsync(STORE_ZK_SETUP_DONE);
}
