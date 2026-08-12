/**
 * wallet-core — VENDORED implementation of the shared `@pooter/wallet` API.
 *
 * IDENTITY CONTRACT v1 (shared with the pooter.world web app):
 * - Root identity is a BIP-39 12-word mnemonic.
 * - EVM account derived at m/44'/60'/0'/0/0.
 * - Encryption at rest: AES-256-GCM, key from PBKDF2-HMAC-SHA256 with
 *   >= 310,000 iterations, 16-byte salt, 12-byte IV.
 * - Serialized payload: JSON { v: 1, salt, iv, ct } with base64 fields.
 *
 * A shared package `@pooter/wallet` will exist at packages/wallet later; this
 * file mirrors its exact API surface (generateMnemonic, validateMnemonic,
 * deriveEvmAccount, encryptMnemonic, decryptMnemonic) so the eventual swap is
 * a one-line import change. Do not add extension-specific behaviour here.
 */

import { generateMnemonic as bip39Generate, validateMnemonic as bip39Validate, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { toHex } from 'viem';

export const DERIVATION_PATH = "m/44'/60'/0'/0/0";
export const PBKDF2_ITERATIONS = 310_000;

export interface EncryptedMnemonic {
  v: 1;
  /** 16-byte PBKDF2 salt, base64. */
  salt: string;
  /** 12-byte AES-GCM IV, base64. */
  iv: string;
  /** Ciphertext (incl. GCM tag), base64. */
  ct: string;
}

/** Generate a new 12-word BIP-39 mnemonic (128 bits of entropy). */
export function generateMnemonic(): string {
  return bip39Generate(english, 128);
}

/** True when the phrase is a valid BIP-39 English mnemonic (checksum included). */
export function validateMnemonic(mnemonic: string): boolean {
  return bip39Validate(normalizeMnemonic(mnemonic), english);
}

/** Derive the EVM account at m/44'/60'/0'/0/0 from a mnemonic. */
export function deriveEvmAccount(mnemonic: string): PrivateKeyAccount {
  const normalized = normalizeMnemonic(mnemonic);
  if (!bip39Validate(normalized, english)) {
    throw new Error('Invalid mnemonic');
  }
  const seed = mnemonicToSeedSync(normalized);
  const child = HDKey.fromMasterSeed(seed).derive(DERIVATION_PATH);
  if (!child.privateKey) throw new Error('Derivation produced no private key');
  return privateKeyToAccount(toHex(child.privateKey));
}

/** Encrypt a mnemonic (or any secret string) with a password. */
export async function encryptMnemonic(mnemonic: string, password: string): Promise<EncryptedMnemonic> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(mnemonic),
  );
  return {
    v: 1,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(ct)),
  };
}

/** Decrypt an EncryptedMnemonic payload. Throws on wrong password/corruption. */
export async function decryptMnemonic(payload: EncryptedMnemonic, password: string): Promise<string> {
  if (payload.v !== 1) throw new Error(`Unsupported wallet payload version: ${payload.v}`);
  const salt = fromBase64(payload.salt);
  const iv = fromBase64(payload.iv);
  const ct = fromBase64(payload.ct);
  const key = await deriveAesKey(password, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    ct.buffer as ArrayBuffer,
  );
  return new TextDecoder().decode(plaintext);
}

// ── internals ──────────────────────────────────────────────────────────────

function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().split(/\s+/).join(' ');
}

async function deriveAesKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
