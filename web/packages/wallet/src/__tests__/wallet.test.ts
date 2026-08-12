import { describe, expect, it } from "vitest";

import {
  decryptMnemonic,
  deriveEvmAccount,
  deriveSolanaKeypair,
  encryptMnemonic,
  generateMnemonic,
  validateMnemonic,
} from "../index";
import { base58Decode, base58Encode } from "../base58";
import { slip10Ed25519Derive, slip10Ed25519Master } from "../slip10";

// Well-known test mnemonic (hardhat/anvil default). Never fund it.
const TEST_MNEMONIC = "test test test test test test test test test test test junk";

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

describe("generateMnemonic / validateMnemonic", () => {
  it("generates a valid 12-word english mnemonic", () => {
    const m = generateMnemonic();
    expect(m.split(" ")).toHaveLength(12);
    expect(validateMnemonic(m)).toBe(true);
  });

  it("generates distinct mnemonics", () => {
    expect(generateMnemonic()).not.toBe(generateMnemonic());
  });

  it("accepts messy but valid input", () => {
    expect(validateMnemonic(`  ${TEST_MNEMONIC.toUpperCase()}  `)).toBe(true);
  });

  it("rejects invalid input without throwing", () => {
    expect(validateMnemonic("")).toBe(false);
    expect(validateMnemonic("not a mnemonic at all")).toBe(false);
    // 12 valid words with a bad checksum
    expect(validateMnemonic("test test test test test test test test test test test test")).toBe(
      false,
    );
    // 11 words
    expect(validateMnemonic(TEST_MNEMONIC.split(" ").slice(0, 11).join(" "))).toBe(false);
  });
});

describe("deriveEvmAccount", () => {
  it("derives the canonical address at m/44'/60'/0'/0/0", () => {
    const account = deriveEvmAccount(TEST_MNEMONIC);
    expect(account.address).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  });

  it("derives the canonical address at index 1", () => {
    const account = deriveEvmAccount(TEST_MNEMONIC, 1);
    expect(account.address).toBe("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  });

  it("returns a signing-capable LocalAccount", async () => {
    const account = deriveEvmAccount(TEST_MNEMONIC);
    const signature = await account.signMessage({ message: "pooter" });
    expect(signature).toMatch(/^0x[0-9a-f]{130}$/);
  });

  it("rejects a negative or fractional index", () => {
    expect(() => deriveEvmAccount(TEST_MNEMONIC, -1)).toThrow();
    expect(() => deriveEvmAccount(TEST_MNEMONIC, 1.5)).toThrow();
  });
});

describe("SLIP-0010 ed25519 (spec test vector 1)", () => {
  // https://github.com/satoshilabs/slips/blob/master/slip-0010.md
  const seed = fromHex("000102030405060708090a0b0c0d0e0f");

  it("derives the master node", () => {
    const master = slip10Ed25519Master(seed);
    expect(hex(master.chainCode)).toBe(
      "90046a93de5380a72b5e45010748567d5ea02bbf6522f979e05c0d8d8ca9fffb",
    );
    expect(hex(master.key)).toBe(
      "2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7",
    );
  });

  it("derives m/0'", () => {
    const key = slip10Ed25519Derive(seed, [0]);
    expect(hex(key)).toBe("68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3");
  });
});

describe("deriveSolanaKeypair", () => {
  it("is deterministic and structurally sound", () => {
    const a = deriveSolanaKeypair(TEST_MNEMONIC);
    const b = deriveSolanaKeypair(TEST_MNEMONIC);
    expect(a.publicKey).toBe(b.publicKey);
    expect(a.secretKey).toEqual(b.secretKey);

    expect(a.secretKey).toHaveLength(64);
    expect(a.publicKeyBytes).toHaveLength(32);
    // secretKey = seed(32) ‖ publicKey(32)
    expect(a.secretKey.slice(32)).toEqual(a.publicKeyBytes);
    // publicKey is the base58 of publicKeyBytes
    expect(base58Decode(a.publicKey)).toEqual(a.publicKeyBytes);
  });

  it("different mnemonics give different keypairs", () => {
    const a = deriveSolanaKeypair(TEST_MNEMONIC);
    const b = deriveSolanaKeypair(generateMnemonic());
    expect(a.publicKey).not.toBe(b.publicKey);
  });
});

describe("base58", () => {
  it("round-trips including leading zeros", () => {
    const cases = [
      new Uint8Array([]),
      new Uint8Array([0]),
      new Uint8Array([0, 0, 1, 2, 3]),
      fromHex("00010203040506070809"),
      Uint8Array.from({ length: 32 }, (_, i) => (i * 7) % 256),
    ];
    for (const bytes of cases) {
      expect(base58Decode(base58Encode(bytes))).toEqual(bytes);
    }
  });

  it("matches a known vector", () => {
    // "hello" in ascii
    expect(base58Encode(new Uint8Array([104, 101, 108, 108, 111]))).toBe("Cn8eVZg");
  });
});

describe("encryptMnemonic / decryptMnemonic", () => {
  it("round-trips and produces the v1 blob shape", () => {
    const blob = encryptMnemonic(TEST_MNEMONIC, "correct horse battery staple");
    const parsed = JSON.parse(blob);
    expect(parsed.v).toBe(1);
    expect(Object.keys(parsed).sort()).toEqual(["ct", "iv", "salt", "v"]);
    expect(atob(parsed.salt)).toHaveLength(16);
    expect(atob(parsed.iv)).toHaveLength(12);
    expect(typeof parsed.ct).toBe("string");
    // ciphertext must not contain the plaintext
    expect(blob).not.toContain("test test");

    expect(decryptMnemonic(blob, "correct horse battery staple")).toBe(TEST_MNEMONIC);
  });

  it("uses a fresh salt and IV every time", () => {
    const password = "pw";
    const a = JSON.parse(encryptMnemonic(TEST_MNEMONIC, password));
    const b = JSON.parse(encryptMnemonic(TEST_MNEMONIC, password));
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it("throws on a wrong password", () => {
    const blob = encryptMnemonic(TEST_MNEMONIC, "right");
    expect(() => decryptMnemonic(blob, "wrong")).toThrow(/wrong password/);
  });

  it("throws on malformed blobs and empty passwords", () => {
    expect(() => encryptMnemonic(TEST_MNEMONIC, "")).toThrow();
    expect(() => decryptMnemonic("not json", "pw")).toThrow(/not valid JSON/);
    expect(() => decryptMnemonic('{"v":2}', "pw")).toThrow(/unrecognized/);
  });
});
