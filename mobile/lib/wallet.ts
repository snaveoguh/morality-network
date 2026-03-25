/**
 * BIP-39 dual-chain wallet — derives both EVM and Solana keys from one mnemonic.
 * Storage: expo-secure-store (iOS Keychain / Android Keystore).
 */
import * as SecureStore from 'expo-secure-store';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';

// ── Storage keys ──────────────────────────────────────────────────────
const STORE_MNEMONIC = 'pw_mnemonic';
const STORE_PASSCODE = 'pw_passcode_hash';
const STORE_HAS_WALLET = 'pw_has_wallet';

// ── BIP-44 derivation paths ──────────────────────────────────────────
const EVM_PATH = "m/44'/60'/0'/0/0";
const SOLANA_PATH = "m/44'/501'/0'/0'";

// ── In-memory state ──────────────────────────────────────────────────
let evmAccount: PrivateKeyAccount | null = null;
let solKeypair: Keypair | null = null;
let cachedMnemonic: string | null = null;

// ── Helpers ──────────────────────────────────────────────────────────

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

function hashPasscode(passcode: string): string {
  // Simple hash for passcode verification (not for encryption — SecureStore handles that)
  let hash = 0;
  for (let i = 0; i < passcode.length; i++) {
    const chr = passcode.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `ph_${Math.abs(hash).toString(36)}`;
}

function loadKeysFromMnemonic(mnemonic: string): void {
  const seed = mnemonicToSeedSync(mnemonic);
  const evmPrivKey = deriveEvmKey(seed);
  evmAccount = privateKeyToAccount(evmPrivKey);
  solKeypair = deriveSolanaKeypair(seed);
  cachedMnemonic = mnemonic;
}

// ── Public API ───────────────────────────────────────────────────────

export async function hasWallet(): Promise<boolean> {
  const val = await SecureStore.getItemAsync(STORE_HAS_WALLET);
  return val === 'true';
}

export async function createWallet(passcode: string): Promise<{
  evmAddress: string;
  solanaAddress: string;
  mnemonic: string;
}> {
  const mnemonic = generateMnemonic(wordlist, 128); // 12 words
  loadKeysFromMnemonic(mnemonic);

  await SecureStore.setItemAsync(STORE_MNEMONIC, mnemonic);
  await SecureStore.setItemAsync(STORE_PASSCODE, hashPasscode(passcode));
  await SecureStore.setItemAsync(STORE_HAS_WALLET, 'true');

  return {
    evmAddress: evmAccount!.address,
    solanaAddress: solKeypair!.publicKey.toBase58(),
    mnemonic,
  };
}

export async function importWallet(
  mnemonic: string,
  passcode: string,
): Promise<{ evmAddress: string; solanaAddress: string }> {
  const trimmed = mnemonic.trim().toLowerCase();
  if (!validateMnemonic(trimmed, wordlist)) {
    throw new Error('Invalid mnemonic phrase');
  }

  loadKeysFromMnemonic(trimmed);

  await SecureStore.setItemAsync(STORE_MNEMONIC, trimmed);
  await SecureStore.setItemAsync(STORE_PASSCODE, hashPasscode(passcode));
  await SecureStore.setItemAsync(STORE_HAS_WALLET, 'true');

  return {
    evmAddress: evmAccount!.address,
    solanaAddress: solKeypair!.publicKey.toBase58(),
  };
}

export async function unlock(passcode: string): Promise<{
  evmAddress: string;
  solanaAddress: string;
}> {
  const storedHash = await SecureStore.getItemAsync(STORE_PASSCODE);
  if (!storedHash || storedHash !== hashPasscode(passcode)) {
    throw new Error('Invalid passcode');
  }

  const mnemonic = await SecureStore.getItemAsync(STORE_MNEMONIC);
  if (!mnemonic) throw new Error('No wallet found');

  loadKeysFromMnemonic(mnemonic);

  return {
    evmAddress: evmAccount!.address,
    solanaAddress: solKeypair!.publicKey.toBase58(),
  };
}

export function lock(): void {
  evmAccount = null;
  solKeypair = null;
  cachedMnemonic = null;
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

export async function getMnemonic(passcode: string): Promise<string> {
  const storedHash = await SecureStore.getItemAsync(STORE_PASSCODE);
  if (!storedHash || storedHash !== hashPasscode(passcode)) {
    throw new Error('Invalid passcode');
  }
  const mnemonic = await SecureStore.getItemAsync(STORE_MNEMONIC);
  if (!mnemonic) throw new Error('No wallet found');
  return mnemonic;
}

export async function deleteWallet(): Promise<void> {
  lock();
  await SecureStore.deleteItemAsync(STORE_MNEMONIC);
  await SecureStore.deleteItemAsync(STORE_PASSCODE);
  await SecureStore.deleteItemAsync(STORE_HAS_WALLET);
}
