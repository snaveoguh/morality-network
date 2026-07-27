#!/usr/bin/env node
/**
 * Sweep ETH out of the legacy morality.network custodial wallets.
 *
 * ─── READ THIS FIRST ──────────────────────────────────────────────────────
 * This script decrypts real private keys. It is the ONLY place in this repo
 * that touches key material, and it is written so that no plaintext key ever
 * reaches disk, argv, an environment variable, or stdout.
 *
 *   - the passphrase is read from a TTY with echo off (never argv, never env)
 *   - decrypted keys live in memory only, and are zeroed after use
 *   - nothing prints a key; the most you ever see is an address
 *
 * Run it offline if you can, and treat every key it touches as compromised
 * afterwards: the legacy scheme is weak (1000 PBKDF2-HMAC-SHA1 rounds, and an
 * IV derived from the same passphrase+salt rather than random per record).
 * Sweep to a fresh wallet; never re-use these addresses.
 *
 * ─── THE LEGACY SCHEME ────────────────────────────────────────────────────
 * Recovered from RateIt.Utilities/BankUtility.cs (.NET Framework 4.5.2):
 *
 *   key||iv = PBKDF2-HMAC-SHA1(passphrase_utf8, salt_ascii, 1000, 48 bytes)
 *   key     = bytes 0..31        iv = bytes 32..47   <- ONE derivation, split
 *   plain   = AES-256-CBC-PKCS7-decrypt(base64_decode(blob))
 *   pk      = plain decoded as UTF-16LE  ->  "0x" + 64 hex chars
 *
 * Deriving the key and IV in two separate PBKDF2 calls will NOT work.
 *
 * ─── USAGE ────────────────────────────────────────────────────────────────
 *   node scripts/sweep-legacy-eth.mjs --verify        # test passphrase only
 *   node scripts/sweep-legacy-eth.mjs --dry-run       # plan the sweep
 *   node scripts/sweep-legacy-eth.mjs --commit --to 0xTreasury
 *
 * --verify decrypts one record and checks the derived address matches the
 * stored one. Do that before anything else: a wrong passphrase yields either
 * a padding error or garbage, and you want to know which.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

import { createPublicClient, createWalletClient, http, formatEther, parseGwei } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

const PROFILES = process.env.LEGACY_PROFILES_CSV || path.join(os.homedir(), "account_profiles.csv");
const RPC_URL = process.env.ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com";

const args = process.argv.slice(2);
const MODE = args.includes("--commit") ? "commit" : args.includes("--verify") ? "verify" : "dry-run";
const TREASURY = (() => {
  const i = args.indexOf("--to");
  return i >= 0 ? args[i + 1] : process.env.SWEEP_TREASURY_ADDRESS;
})();

// Leave a margin over the exact gas cost so a small basefee bump between
// estimate and inclusion doesn't strand the transaction.
const GAS_LIMIT = 21000n;
const FEE_HEADROOM = 130n; // percent

// ── secrets in, nothing out ────────────────────────────────────────────────

/** Read a passphrase from the TTY with echo disabled. Never touches argv/env. */
function promptSecret(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error("stdin is not a TTY — run this interactively so the passphrase is not echoed or logged"));
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (char) => {
      // Re-print the prompt without the typed characters.
      if (![`\n`, `\r`, ``].includes(char.toString())) {
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(question);
      }
    };
    process.stdin.on("data", onData);
    rl.question(question, (answer) => {
      process.stdin.removeListener("data", onData);
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

/** Overwrite a Buffer so the plaintext key does not linger in the heap. */
function wipe(buf) {
  if (Buffer.isBuffer(buf)) buf.fill(0);
}

/**
 * Decrypt one legacy blob. Returns a Buffer holding the "0x…" key as ASCII.
 * The caller MUST wipe() the result. Never log or return this as a string that
 * outlives the sweep of a single wallet.
 */
function decryptLegacyKey(blob, salt, passphrase) {
  // Legacy blobs that survived a URL round-trip have '+' mangled into ' '.
  const cipher = Buffer.from(String(blob).replace(/ /g, "+"), "base64");
  const derived = crypto.pbkdf2Sync(passphrase, Buffer.from(salt, "ascii"), 1000, 48, "sha1");
  const decipher = crypto.createDecipheriv("aes-256-cbc", derived.subarray(0, 32), derived.subarray(32, 48));
  const plain = Buffer.concat([decipher.update(cipher), decipher.final()]);
  wipe(derived);
  const key = Buffer.from(plain.toString("utf16le"), "ascii");
  wipe(plain);
  return key;
}

// ── the legacy export ──────────────────────────────────────────────────────
// Columns: Id, Email, Id, Address, EncryptedPrivateKey, Salt, VirtualMOBalance,
//          ETHBalance, MOBalance
function readProfiles() {
  const lines = fs.readFileSync(PROFILES, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    if (c.length !== 9) throw new Error(`account_profiles.csv line ${i + 1}: expected 9 fields, got ${c.length}`);
    const address = (c[3] || "").trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) continue;
    rows.push({ address, blob: (c[4] || "").trim(), salt: (c[5] || "").trim() });
  }
  return rows;
}

// ── main ───────────────────────────────────────────────────────────────────
const rows = readProfiles();
console.log(`legacy wallets on file: ${rows.length}`);
console.log(`mode: ${MODE}`);

if (MODE === "commit" && !/^0x[0-9a-fA-F]{40}$/.test(TREASURY || "")) {
  console.error("\n--commit requires a valid destination: --to 0xYourTreasuryAddress");
  console.error("Use a FRESH wallet you control. Do not reuse any legacy address.");
  process.exit(1);
}

const passphrase = await promptSecret("Legacy wallet encryption passphrase (input hidden): ");
if (!passphrase) {
  console.error("no passphrase given");
  process.exit(1);
}

// ── verify the passphrase against a real record before doing anything ──────
{
  const probe = rows[0];
  let key;
  try {
    key = decryptLegacyKey(probe.blob, probe.salt, passphrase);
    const text = key.toString("ascii");
    if (!/^0x[0-9a-fA-F]{64}$/.test(text)) {
      console.error("\n✗ Passphrase decrypts, but the result is not a private key.");
      console.error("  Wrong passphrase, or the salt/encoding assumption is off.");
      process.exit(1);
    }
    const derivedAddress = privateKeyToAccount(text).address.toLowerCase();
    if (derivedAddress !== probe.address.toLowerCase()) {
      console.error("\n✗ Decrypted key does not correspond to the stored address.");
      console.error(`  stored:  ${probe.address}`);
      console.error(`  derived: ${derivedAddress}`);
      process.exit(1);
    }
    console.log(`\n✓ Passphrase verified — decrypted key matches ${probe.address}`);
  } catch (err) {
    console.error(`\n✗ Decryption failed: ${err.message}`);
    console.error("  A bad passphrase usually surfaces here as a padding error.");
    process.exit(1);
  } finally {
    wipe(key);
  }
}

if (MODE === "verify") {
  console.log("\n--verify only; nothing else was decrypted and no funds moved.");
  process.exit(0);
}

// ── survey balances ────────────────────────────────────────────────────────
const publicClient = createPublicClient({ chain: mainnet, transport: http(RPC_URL) });

console.log("\nreading balances…");
const funded = [];
let checked = 0;
for (const row of rows) {
  const balance = await publicClient.getBalance({ address: row.address });
  if (balance > 0n) funded.push({ ...row, balance });
  if (++checked % 100 === 0) process.stderr.write(`  ${checked}/${rows.length}\n`);
}

const feeData = await publicClient.estimateFeesPerGas();
const maxFeePerGas = (feeData.maxFeePerGas * FEE_HEADROOM) / 100n;
const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
const gasCost = maxFeePerGas * GAS_LIMIT;

console.log(`\nwallets holding ETH: ${funded.length}`);
console.log(`gas: maxFee ${formatEther(maxFeePerGas * 10n ** 9n)} gwei-ish, cost/tx ${formatEther(gasCost)} ETH`);

const viable = funded.filter((w) => w.balance > gasCost);
const dust = funded.filter((w) => w.balance <= gasCost);
const gross = funded.reduce((t, w) => t + w.balance, 0n);
const net = viable.reduce((t, w) => t + (w.balance - gasCost), 0n);

console.log(`\ngross held:      ${formatEther(gross)} ETH`);
console.log(`sweepable:       ${viable.length} wallets -> ${formatEther(net)} ETH net of gas`);
if (dust.length) console.log(`skipped as dust: ${dust.length} wallets (balance <= gas cost)`);

for (const w of viable) console.log(`  ${w.address}  ${formatEther(w.balance)} ETH`);

if (MODE === "dry-run") {
  console.log("\nDRY RUN — nothing signed, nothing sent.");
  console.log("Re-run with:  --commit --to 0xYourTreasuryAddress");
  process.exit(0);
}

// ── sweep ──────────────────────────────────────────────────────────────────
console.log(`\nsweeping ${viable.length} wallets to ${TREASURY}`);
const receipts = [];
let swept = 0n;
let failures = 0;

for (const w of viable) {
  let key;
  try {
    key = decryptLegacyKey(w.blob, w.salt, passphrase);
    const account = privateKeyToAccount(key.toString("ascii"));
    if (account.address.toLowerCase() !== w.address.toLowerCase()) {
      console.error(`  ${w.address}  SKIP — key/address mismatch`);
      failures++;
      continue;
    }
    // Re-read the balance at send time; it may have moved since the survey.
    const balance = await publicClient.getBalance({ address: w.address });
    const value = balance - gasCost;
    if (value <= 0n) {
      console.log(`  ${w.address}  SKIP — no longer covers gas`);
      continue;
    }
    const wallet = createWalletClient({ account, chain: mainnet, transport: http(RPC_URL) });
    const hash = await wallet.sendTransaction({
      to: TREASURY,
      value,
      gas: GAS_LIMIT,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });
    swept += value;
    receipts.push({ from: w.address, to: TREASURY, value: formatEther(value), hash });
    console.log(`  ${w.address}  ${formatEther(value)} ETH  ${hash}`);
  } catch (err) {
    failures++;
    console.error(`  ${w.address}  FAILED — ${err.shortMessage || err.message}`);
  } finally {
    wipe(key);
  }
}

console.log(`\nswept ${formatEther(swept)} ETH in ${receipts.length} transactions` + (failures ? `, ${failures} failed` : ""));

// Receipts only — addresses, amounts and tx hashes. No key material.
const outDir = path.join(process.cwd(), "scripts", "out");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "eth-sweep-receipts.json");
fs.writeFileSync(outFile, JSON.stringify(receipts, null, 2));
console.log(`receipts written to ${outFile}`);
