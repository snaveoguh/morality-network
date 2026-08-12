import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha2";
import { utf8ToBytes } from "@noble/hashes/utils";

/**
 * SLIP-0010 hierarchical key derivation for ed25519.
 *
 * @scure/bip32 is secp256k1-only, so the ed25519 branch (Solana) is
 * implemented here directly from the spec. ed25519 supports HARDENED
 * derivation only — every path segment is hardened by construction.
 *
 * Verified against the SLIP-0010 ed25519 test vectors (see tests).
 */

export const HARDENED_OFFSET = 0x80000000;

interface Slip10Node {
  key: Uint8Array; // 32-byte private key (the ed25519 seed)
  chainCode: Uint8Array; // 32 bytes
}

function ser32(index: number): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = (index >>> 24) & 0xff;
  out[1] = (index >>> 16) & 0xff;
  out[2] = (index >>> 8) & 0xff;
  out[3] = index & 0xff;
  return out;
}

/** Master node: I = HMAC-SHA512(key = "ed25519 seed", data = seed). */
export function slip10Ed25519Master(seed: Uint8Array): Slip10Node {
  const i = hmac(sha512, utf8ToBytes("ed25519 seed"), seed);
  return { key: i.slice(0, 32), chainCode: i.slice(32) };
}

function childNode(parent: Slip10Node, index: number): Slip10Node {
  // ed25519: hardened children only.
  const hardened = index >= HARDENED_OFFSET ? index : index + HARDENED_OFFSET;
  const data = new Uint8Array(1 + 32 + 4);
  data[0] = 0x00;
  data.set(parent.key, 1);
  data.set(ser32(hardened >>> 0), 33);
  const i = hmac(sha512, parent.chainCode, data);
  return { key: i.slice(0, 32), chainCode: i.slice(32) };
}

/**
 * Derive the 32-byte ed25519 private key at the given path (indices WITHOUT
 * the hardened offset — it is applied unconditionally, per ed25519 SLIP-0010).
 */
export function slip10Ed25519Derive(seed: Uint8Array, path: number[]): Uint8Array {
  let node = slip10Ed25519Master(seed);
  for (const index of path) {
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`slip10Ed25519Derive: invalid path index ${index}`);
    }
    node = childNode(node, index);
  }
  return node.key;
}
