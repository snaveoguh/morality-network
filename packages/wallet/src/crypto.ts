import { gcm } from "@noble/ciphers/aes";
import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha2";
import { randomBytes, utf8ToBytes } from "@noble/hashes/utils";

/**
 * Password encryption for a mnemonic at rest (e.g. extension storage).
 *
 * AES-256-GCM, key from PBKDF2-HMAC-SHA256 with 310,000 iterations (OWASP
 * 2023 floor), 16-byte random salt, 12-byte random IV. Output is a JSON blob
 * `{v:1, salt, iv, ct}` with base64 fields — versioned so the KDF can be
 * upgraded later without stranding old blobs.
 *
 * This protects the mnemonic ON the device. It is not a substitute for the
 * rule that the mnemonic never leaves the device.
 */

export const PBKDF2_ITERATIONS = 310_000;

const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface EncryptedMnemonicV1 {
  v: 1;
  salt: string; // base64, 16 bytes
  iv: string; // base64, 12 bytes
  ct: string; // base64 ciphertext + GCM tag
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  // Chunked to keep the argument list small on large inputs.
  const CHUNK = 0x2000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function deriveKey(password: string, salt: Uint8Array): Uint8Array {
  return pbkdf2(sha256, utf8ToBytes(password.normalize("NFKD")), salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: 32,
  });
}

/** Encrypt a mnemonic under a password. Returns the JSON blob as a string. */
export function encryptMnemonic(mnemonic: string, password: string): string {
  if (!password) throw new Error("encryptMnemonic: password must not be empty");
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = deriveKey(password, salt);
  const ciphertext = gcm(key, iv).encrypt(utf8ToBytes(mnemonic));

  const blob: EncryptedMnemonicV1 = {
    v: 1,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(ciphertext),
  };
  return JSON.stringify(blob);
}

/**
 * Decrypt a blob produced by encryptMnemonic. Throws on a malformed blob or a
 * wrong password (GCM authentication failure) — it never returns garbage.
 */
export function decryptMnemonic(blob: string, password: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(blob);
  } catch {
    throw new Error("decryptMnemonic: blob is not valid JSON");
  }
  const candidate = parsed as Partial<EncryptedMnemonicV1> | null;
  if (
    !candidate ||
    candidate.v !== 1 ||
    typeof candidate.salt !== "string" ||
    typeof candidate.iv !== "string" ||
    typeof candidate.ct !== "string"
  ) {
    throw new Error("decryptMnemonic: unrecognized blob format");
  }

  const salt = base64ToBytes(candidate.salt);
  const iv = base64ToBytes(candidate.iv);
  const ciphertext = base64ToBytes(candidate.ct);
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES) {
    throw new Error("decryptMnemonic: unrecognized blob format");
  }

  const key = deriveKey(password, salt);
  let plaintext: Uint8Array;
  try {
    plaintext = gcm(key, iv).decrypt(ciphertext);
  } catch {
    throw new Error("decryptMnemonic: wrong password or corrupted blob");
  }
  return new TextDecoder().decode(plaintext);
}
