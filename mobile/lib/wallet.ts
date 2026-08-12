/**
 * BIP-39 dual-chain wallet — derives both EVM and Solana keys from one mnemonic.
 *
 * Storage: expo-secure-store (iOS Keychain / Android Keystore), with the
 * mnemonic additionally encrypted at rest per the pooter.world identity
 * contract v1:
 *
 *   AES-256-GCM, key = PBKDF2-HMAC-SHA256(pin, salt, 310_000 iterations)
 *   record  = JSON {v:1, salt, iv, ct} (base64 fields), 16-byte salt, 12-byte IV
 *
 * PIN verification is PBKDF2-based: we derive 64 bytes and use the first 32 as
 * the AES key and the last 32 as a stored verifier (constant-time compared).
 * The GCM auth tag independently rejects wrong PINs. The legacy djb2-style
 * 32-bit hash + plaintext mnemonic records are migrated on the next successful
 * unlock and then deleted.
 */
import { Buffer } from 'buffer';
import * as SecureStore from 'expo-secure-store';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { gcm } from '@noble/ciphers/aes';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';

// ── Storage keys ──────────────────────────────────────────────────────
const STORE_WALLET_V1 = 'pw_wallet_v1'; // JSON {v:1,salt,iv,ct,verifier}
const STORE_HAS_WALLET = 'pw_has_wallet';
// Legacy (pre-v1) keys — plaintext mnemonic + djb2 PIN hash. Migrated on unlock.
const LEGACY_MNEMONIC = 'pw_mnemonic';
const LEGACY_PASSCODE = 'pw_passcode_hash';

// ── KDF parameters (identity contract v1) ────────────────────────────
const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

// ── BIP-44 derivation paths ──────────────────────────────────────────
const EVM_PATH = "m/44'/60'/0'/0/0";
const SOLANA_PATH = "m/44'/501'/0'/0'";

// ── In-memory state ──────────────────────────────────────────────────
let evmAccount: PrivateKeyAccount | null = null;
let solKeypair: Keypair | null = null;

// ── Crypto helpers ───────────────────────────────────────────────────

interface WalletRecordV1 {
  v: 1;
  salt: string; // base64, 16 bytes
  iv: string; // base64, 12 bytes
  ct: string; // base64, AES-256-GCM ciphertext (tag appended)
  verifier: string; // base64, last 32 bytes of the 64-byte PBKDF2 output
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function unb64(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64'));
}

/** Derive 64 bytes: [0..32) AES-256 key, [32..64) PIN verifier. */
function deriveKeyAndVerifier(pin: string, salt: Uint8Array): {
  key: Uint8Array;
  verifier: Uint8Array;
} {
  const dk = pbkdf2(sha256, pin, salt, { c: PBKDF2_ITERATIONS, dkLen: 64 });
  return { key: dk.slice(0, 32), verifier: dk.slice(32, 64) };
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function encryptMnemonic(mnemonic: string, pin: string): WalletRecordV1 {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const { key, verifier } = deriveKeyAndVerifier(pin, salt);
  const ct = gcm(key, iv).encrypt(new TextEncoder().encode(mnemonic));
  key.fill(0);
  return { v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct), verifier: b64(verifier) };
}

/** Throws 'Invalid PIN' on a wrong PIN. */
function decryptMnemonic(record: WalletRecordV1, pin: string): string {
  const salt = unb64(record.salt);
  const { key, verifier } = deriveKeyAndVerifier(pin, salt);
  if (!constantTimeEqual(verifier, unb64(record.verifier))) {
    key.fill(0);
    throw new Error('Invalid PIN');
  }
  try {
    const pt = gcm(key, unb64(record.iv)).decrypt(unb64(record.ct));
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error('Invalid PIN');
  } finally {
    key.fill(0);
  }
}

/** The old 32-bit djb2-style hash — kept ONLY to verify legacy records during migration. */
function legacyHashPasscode(passcode: string): string {
  let hash = 0;
  for (let i = 0; i < passcode.length; i++) {
    const chr = passcode.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `ph_${Math.abs(hash).toString(36)}`;
}

async function persistEncrypted(mnemonic: string, pin: string): Promise<void> {
  const record = encryptMnemonic(mnemonic, pin);
  await SecureStore.setItemAsync(STORE_WALLET_V1, JSON.stringify(record));
  await SecureStore.setItemAsync(STORE_HAS_WALLET, 'true');
}

/**
 * Load + decrypt the stored mnemonic, migrating legacy plaintext records to
 * the v1 encrypted format on the first successful PIN check.
 */
async function loadMnemonicWithPin(pin: string): Promise<string> {
  const raw = await SecureStore.getItemAsync(STORE_WALLET_V1);
  if (raw) {
    let record: WalletRecordV1;
    try {
      record = JSON.parse(raw);
    } catch {
      throw new Error('Wallet record is corrupted');
    }
    if (record.v !== 1) throw new Error(`Unsupported wallet record version: ${record.v}`);
    return decryptMnemonic(record, pin);
  }

  // Legacy path: plaintext mnemonic + djb2 hash. Verify, migrate, delete.
  const legacyHash = await SecureStore.getItemAsync(LEGACY_PASSCODE);
  const legacyMnemonic = await SecureStore.getItemAsync(LEGACY_MNEMONIC);
  if (!legacyHash || !legacyMnemonic) throw new Error('No wallet found');
  if (legacyHash !== legacyHashPasscode(pin)) throw new Error('Invalid PIN');

  await persistEncrypted(legacyMnemonic, pin);
  await SecureStore.deleteItemAsync(LEGACY_MNEMONIC);
  await SecureStore.deleteItemAsync(LEGACY_PASSCODE);
  return legacyMnemonic;
}

// ── Key derivation ───────────────────────────────────────────────────

function deriveEvmKey(seed: Uint8Array): `0x${string}` {
  const hd = HDKey.fromMasterSeed(seed);
  const child = hd.derive(EVM_PATH);
  if (!child.privateKey) throw new Error('EVM key derivation failed');
  return `0x${Buffer.from(child.privateKey).toString('hex')}` as `0x${string}`;
}

function deriveSolanaKeypair(seed: Uint8Array): Keypair {
  const hd = HDKey.fromMasterSeed(seed);
  const child = hd.derive(SOLANA_PATH);
  if (!child.privateKey) throw new Error('Solana key derivation failed');
  // ed25519 keypair from the 32-byte seed
  const kp = nacl.sign.keyPair.fromSeed(child.privateKey);
  return Keypair.fromSecretKey(kp.secretKey);
}

function loadKeysFromMnemonic(mnemonic: string): void {
  const seed = mnemonicToSeedSync(mnemonic);
  const evmPrivKey = deriveEvmKey(seed);
  evmAccount = privateKeyToAccount(evmPrivKey);
  solKeypair = deriveSolanaKeypair(seed);
}

// ── Public API ───────────────────────────────────────────────────────

export async function hasWallet(): Promise<boolean> {
  const val = await SecureStore.getItemAsync(STORE_HAS_WALLET);
  return val === 'true';
}

export async function createWallet(pin: string): Promise<{
  evmAddress: string;
  solanaAddress: string;
  mnemonic: string;
}> {
  const mnemonic = generateMnemonic(wordlist, 128); // 12 words
  loadKeysFromMnemonic(mnemonic);
  await persistEncrypted(mnemonic, pin);

  return {
    evmAddress: evmAccount!.address,
    solanaAddress: solKeypair!.publicKey.toBase58(),
    mnemonic,
  };
}

export async function importWallet(
  mnemonic: string,
  pin: string,
): Promise<{ evmAddress: string; solanaAddress: string }> {
  const trimmed = mnemonic.trim().toLowerCase();
  if (!validateMnemonic(trimmed, wordlist)) {
    throw new Error('Invalid mnemonic phrase');
  }

  loadKeysFromMnemonic(trimmed);
  await persistEncrypted(trimmed, pin);

  return {
    evmAddress: evmAccount!.address,
    solanaAddress: solKeypair!.publicKey.toBase58(),
  };
}

export async function unlock(pin: string): Promise<{
  evmAddress: string;
  solanaAddress: string;
}> {
  const mnemonic = await loadMnemonicWithPin(pin);
  loadKeysFromMnemonic(mnemonic);

  return {
    evmAddress: evmAccount!.address,
    solanaAddress: solKeypair!.publicKey.toBase58(),
  };
}

export function lock(): void {
  evmAccount = null;
  solKeypair = null;
}

export function isLocked(): boolean {
  return evmAccount === null;
}

export function getEvmAccount(): PrivateKeyAccount {
  if (!evmAccount) throw new Error('Wallet is locked');
  return evmAccount;
}

export function getSolanaKeypair(): Keypair {
  if (!solKeypair) throw new Error('Wallet is locked');
  return solKeypair;
}

export function getEvmAddress(): string | null {
  return evmAccount?.address ?? null;
}

export function getSolanaAddress(): string | null {
  return solKeypair?.publicKey.toBase58() ?? null;
}

/** PIN-gated mnemonic read for the reveal screen. Never cache the result. */
export async function getMnemonic(pin: string): Promise<string> {
  return loadMnemonicWithPin(pin);
}

export async function deleteWallet(): Promise<void> {
  lock();
  await SecureStore.deleteItemAsync(STORE_WALLET_V1);
  await SecureStore.deleteItemAsync(LEGACY_MNEMONIC);
  await SecureStore.deleteItemAsync(LEGACY_PASSCODE);
  await SecureStore.deleteItemAsync(STORE_HAS_WALLET);
}
