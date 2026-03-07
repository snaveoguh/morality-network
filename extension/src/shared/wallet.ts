import { privateKeyToAccount, generatePrivateKey, type PrivateKeyAccount } from 'viem/accounts';
import { formatEther } from 'viem';
import { STORAGE_WALLET } from './constants';
import { getPublicClient, createWallet as createWalletClient } from './rpc';
import type { WalletInfo } from './types';

// In-memory unlocked account (cleared when service worker terminates)
let account: PrivateKeyAccount | null = null;

// ============================================================================
// ENCRYPTION (AES-256-GCM + PBKDF2)
// ============================================================================

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
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

async function encrypt(data: string, password: string): Promise<{ iv: string; salt: string; ciphertext: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(data)
  );
  return {
    iv: bufToHex(iv),
    salt: bufToHex(salt),
    ciphertext: bufToHex(new Uint8Array(encrypted)),
  };
}

async function decrypt(encrypted: { iv: string; salt: string; ciphertext: string }, password: string): Promise<string> {
  const iv = hexToBuf(encrypted.iv);
  const salt = hexToBuf(encrypted.salt);
  const ciphertext = hexToBuf(encrypted.ciphertext);
  const key = await deriveKey(password, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext.buffer as ArrayBuffer
  );
  return new TextDecoder().decode(decrypted);
}

function bufToHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
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

export async function createNewWallet(password: string): Promise<string> {
  const privateKey = generatePrivateKey();
  account = privateKeyToAccount(privateKey);
  const encrypted = await encrypt(privateKey, password);
  await chrome.storage.local.set({ [STORAGE_WALLET]: encrypted });
  return account.address;
}

export async function importWallet(privateKey: string, password: string): Promise<string> {
  // Validate key format
  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error('Invalid private key format');
  }
  account = privateKeyToAccount(privateKey as `0x${string}`);
  const encrypted = await encrypt(privateKey, password);
  await chrome.storage.local.set({ [STORAGE_WALLET]: encrypted });
  return account.address;
}

export async function unlockWallet(password: string): Promise<string> {
  const stored = await chrome.storage.local.get(STORAGE_WALLET);
  if (!stored[STORAGE_WALLET]) throw new Error('No wallet found');
  try {
    const privateKey = await decrypt(stored[STORAGE_WALLET] as { iv: string; salt: string; ciphertext: string }, password);
    account = privateKeyToAccount(privateKey as `0x${string}`);
    return account.address;
  } catch {
    throw new Error('Wrong password');
  }
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
  const stored = await chrome.storage.local.get(STORAGE_WALLET);
  return !!stored[STORAGE_WALLET];
}

export async function getWalletInfo(): Promise<WalletInfo> {
  const has = await hasWallet();
  let balance = '0';
  if (account) {
    try {
      const client = getPublicClient();
      const bal = await client.getBalance({ address: account.address });
      balance = formatEther(bal);
    } catch {
      balance = '?';
    }
  }
  return {
    address: account?.address || null,
    balance,
    isLocked: account === null,
    hasWallet: has,
  };
}

export function getWalletClient() {
  if (!account) throw new Error('Wallet is locked');
  return createWalletClient(account);
}
