import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { formatEther } from 'viem';
import { STORAGE_WALLET } from './constants';
import { getPublicClient, createWallet as createWalletClient } from './rpc';
import {
  generateMnemonic, validateMnemonic, deriveEvmAccount,
  encryptMnemonic, decryptMnemonic, type EncryptedMnemonic,
} from './wallet-core';
import type { WalletInfo } from './types';

// In-memory unlocked account (cleared when service worker terminates)
let account: PrivateKeyAccount | null = null;

// ============================================================================
// STORAGE FORMATS
//
// v2 (0.2.0+): { version: 2, type: 'mnemonic' | 'privateKey', address, enc }
//   - enc is the shared wallet-core payload { v:1, salt, iv, ct } (base64,
//     AES-256-GCM, PBKDF2-HMAC-SHA256 310k iterations).
//   - type 'mnemonic': enc decrypts to the 12 words; account derived at
//     m/44'/60'/0'/0/0.
//   - type 'privateKey': enc decrypts to a raw 0x private key (legacy wallets
//     migrated forward, or explicit key imports).
//
// legacy (0.1.0): { iv, salt, ciphertext } hex fields, AES-256-GCM with
//   PBKDF2 at 100k iterations, plaintext = raw private key. Still readable:
//   on first successful unlock the wallet is transparently re-encrypted into
//   the v2 'privateKey' format. Signing behaviour is unchanged — the same key
//   keeps working.
// ============================================================================

interface StoredWalletV2 {
  version: 2;
  type: 'mnemonic' | 'privateKey';
  address: string;
  enc: EncryptedMnemonic;
}

interface StoredWalletLegacy {
  iv: string;
  salt: string;
  ciphertext: string;
}

type StoredWallet = StoredWalletV2 | StoredWalletLegacy;

function isLegacy(w: StoredWallet): w is StoredWalletLegacy {
  return typeof (w as StoredWalletLegacy).ciphertext === 'string';
}

async function readStored(): Promise<StoredWallet | null> {
  const stored = await chrome.storage.local.get(STORAGE_WALLET);
  return (stored[STORAGE_WALLET] as StoredWallet) || null;
}

async function writeStored(w: StoredWalletV2): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_WALLET]: w });
}

// ============================================================================
// LEGACY DECRYPTION (0.1.0 raw-key wallets — hex fields, 100k iterations)
// ============================================================================

async function legacyDeriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function legacyDecrypt(encrypted: StoredWalletLegacy, password: string): Promise<string> {
  const iv = hexToBuf(encrypted.iv);
  const salt = hexToBuf(encrypted.salt);
  const ciphertext = hexToBuf(encrypted.ciphertext);
  const key = await legacyDeriveKey(password, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext.buffer as ArrayBuffer
  );
  return new TextDecoder().decode(decrypted);
}

function hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// ============================================================================
// WALLET OPERATIONS
// ============================================================================

/**
 * Create a new mnemonic wallet. Returns the mnemonic exactly once so the UI
 * can run the write-your-words-down flow; it is not retrievable afterwards
 * without the password.
 */
export async function createNewWallet(password: string): Promise<{ address: string; mnemonic: string }> {
  const mnemonic = generateMnemonic();
  account = deriveEvmAccount(mnemonic);
  const enc = await encryptMnemonic(mnemonic, password);
  await writeStored({ version: 2, type: 'mnemonic', address: account.address, enc });
  return { address: account.address, mnemonic };
}

/** Import an existing 12/24-word BIP-39 mnemonic. */
export async function importMnemonic(mnemonic: string, password: string): Promise<string> {
  if (!validateMnemonic(mnemonic)) {
    throw new Error('That is not a valid recovery phrase');
  }
  const normalized = mnemonic.trim().toLowerCase().split(/\s+/).join(' ');
  account = deriveEvmAccount(normalized);
  const enc = await encryptMnemonic(normalized, password);
  await writeStored({ version: 2, type: 'mnemonic', address: account.address, enc });
  return account.address;
}

/** Import a raw private key (legacy path — kept for existing users). */
export async function importWallet(privateKey: string, password: string): Promise<string> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error('Invalid private key format');
  }
  account = privateKeyToAccount(privateKey as `0x${string}`);
  const enc = await encryptMnemonic(privateKey, password);
  await writeStored({ version: 2, type: 'privateKey', address: account.address, enc });
  return account.address;
}

export async function unlockWallet(password: string): Promise<string> {
  const stored = await readStored();
  if (!stored) throw new Error('No wallet found');

  if (isLegacy(stored)) {
    // 0.1.0 raw-key wallet: decrypt with the old parameters, then migrate
    // forward to the v2 format. Same key, same address, stronger KDF.
    let privateKey: string;
    try {
      privateKey = await legacyDecrypt(stored, password);
    } catch {
      throw new Error('Wrong password');
    }
    account = privateKeyToAccount(privateKey as `0x${string}`);
    try {
      const enc = await encryptMnemonic(privateKey, password);
      await writeStored({ version: 2, type: 'privateKey', address: account.address, enc });
    } catch {
      // Migration failure is non-fatal — the legacy blob still unlocks.
    }
    return account.address;
  }

  let secret: string;
  try {
    secret = await decryptMnemonic(stored.enc, password);
  } catch {
    throw new Error('Wrong password');
  }
  account = stored.type === 'mnemonic'
    ? deriveEvmAccount(secret)
    : privateKeyToAccount(secret as `0x${string}`);
  return account.address;
}

export function lockWallet(): void {
  account = null;
}

export function isLocked(): boolean {
  return account === null;
}

export function getAccount(): PrivateKeyAccount | null {
  return account;
}

export async function hasWallet(): Promise<boolean> {
  return (await readStored()) !== null;
}

export async function getWalletInfo(): Promise<WalletInfo> {
  const stored = await readStored();
  let balance = '0';
  if (account) {
    try {
      const client = getPublicClient();
      const bal = await Promise.race<bigint>([
        client.getBalance({ address: account.address }) as Promise<bigint>,
        new Promise<bigint>((_, reject) => {
          setTimeout(() => reject(new Error('Balance request timeout')), 4500);
        }),
      ]);
      balance = formatEther(bal);
    } catch {
      balance = '?';
    }
  }
  const walletType: WalletInfo['walletType'] = !stored
    ? null
    : isLegacy(stored)
      ? 'legacy'
      : stored.type;
  return {
    // v2 wallets know their address without unlocking; legacy ones don't.
    address: account?.address || (stored && !isLegacy(stored) ? stored.address : null),
    balance,
    isLocked: account === null,
    hasWallet: stored !== null,
    walletType,
  };
}

export function getWalletClient() {
  if (!account) throw new Error('Wallet is locked');
  return createWalletClient(account);
}
