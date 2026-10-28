// Content hashing for MP Record versioning (MP_RECORD_SPEC §4.3).
// Changing anything here changes every hash: bump HASH_RECIPE and write a
// re-hash migration rather than editing in place.

import { createHash } from "node:crypto";

export const HASH_RECIPE = "mp-record-hash-v1";

/**
 * Deterministic JSON: object keys sorted recursively, array order kept,
 * undefined dropped (as JSON.stringify does), non-finite numbers rejected.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`canonicalJson: non-finite number ${value}`);
    return JSON.stringify(value);
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  throw new Error(`canonicalJson: unsupported type ${typeof value}`);
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Hash of a normalised record's content (provenance fields excluded by the caller). */
export function contentHash(data: unknown): string {
  return sha256Hex(`${HASH_RECIPE}\n${canonicalJson(data)}`);
}
