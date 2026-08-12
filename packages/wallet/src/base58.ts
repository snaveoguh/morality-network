/**
 * Minimal base58 (Bitcoin/Solana alphabet) — kept in-package so the dependency
 * surface stays limited to the audited noble/scure set.
 *
 * BigInt is used via the constructor (no literals) so the package typechecks
 * under consumers targeting < ES2020, e.g. web/'s ES2017 tsconfig.
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ALPHABET_MAP = new Map<string, number>(
  Array.from(ALPHABET, (char, index) => [char, index] as const),
);

const B_0 = BigInt(0);
const B_58 = BigInt(58);
const B_256 = BigInt(256);
const B_255 = BigInt(255);

export function base58Encode(bytes: Uint8Array): string {
  let value = B_0;
  for (const byte of bytes) value = value * B_256 + BigInt(byte);

  let out = "";
  while (value > B_0) {
    out = ALPHABET[Number(value % B_58)] + out;
    value /= B_58;
  }
  // Leading zero bytes encode as '1' each.
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = "1" + out;
  }
  return out;
}

export function base58Decode(encoded: string): Uint8Array {
  let value = B_0;
  for (const char of encoded) {
    const digit = ALPHABET_MAP.get(char);
    if (digit === undefined) throw new Error(`base58Decode: invalid character "${char}"`);
    value = value * B_58 + BigInt(digit);
  }

  const bytes: number[] = [];
  while (value > B_0) {
    bytes.unshift(Number(value & B_255));
    value /= B_256;
  }
  for (const char of encoded) {
    if (char !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}
