// HMAC verification for worker → web signing API.
//
// The worker (a standalone agent process) and the web app share a single
// secret, AGENT_WORKER_HMAC_SECRET. The worker signs each request body with
// HMAC-SHA256 over `${timestamp}.${method}.${path}.${bodyHash}` and submits
// the signature + timestamp as headers. The web side verifies the signature
// and rejects timestamps outside REPLAY_WINDOW_SECONDS.
//
// Single shared secret is sufficient because both processes are operator-
// owned and the wallet routing happens *inside* the signed agent ID. A
// compromised worker can already act as any agent it knows about; per-agent
// secrets would not change that threat model.

import { createHmac, timingSafeEqual } from "node:crypto";

export const REPLAY_WINDOW_SECONDS = 60;
export const HEADER_TIMESTAMP = "x-agent-timestamp";
export const HEADER_SIGNATURE = "x-agent-signature";

function requireSecret(): string {
  const raw = process.env.AGENT_WORKER_HMAC_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error("AGENT_WORKER_HMAC_SECRET not set (need ≥32 chars)");
  }
  return raw;
}

function bodyHash(body: string): string {
  return createHmac("sha256", "pooter:body-hash:v1").update(body).digest("hex");
}

export function signRequest(params: {
  method: string;
  path: string;
  body: string;
  timestamp: number;
  secret: string;
}): string {
  const message = `${params.timestamp}.${params.method.toUpperCase()}.${params.path}.${bodyHash(params.body)}`;
  return createHmac("sha256", params.secret).update(message).digest("hex");
}

export type HmacVerifyResult =
  | { ok: true }
  | { ok: false; reason: string; status: number };

export function verifyRequest(params: {
  method: string;
  path: string;
  body: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  nowSeconds?: number;
}): HmacVerifyResult {
  if (!params.timestampHeader || !params.signatureHeader) {
    return { ok: false, reason: "missing auth headers", status: 401 };
  }

  const ts = Number(params.timestampHeader);
  if (!Number.isFinite(ts) || ts <= 0) {
    return { ok: false, reason: "invalid timestamp", status: 401 };
  }

  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > REPLAY_WINDOW_SECONDS) {
    return { ok: false, reason: "timestamp outside replay window", status: 401 };
  }

  // Only resolve the secret after the request looks well-formed, so that
  // unauthenticated callers can't probe whether the secret is configured.
  let secret: string;
  try {
    secret = requireSecret();
  } catch (err) {
    return { ok: false, reason: (err as Error).message, status: 500 };
  }

  const expected = signRequest({
    method: params.method,
    path: params.path,
    body: params.body,
    timestamp: ts,
    secret,
  });

  const given = params.signatureHeader.toLowerCase();
  if (given.length !== expected.length) {
    return { ok: false, reason: "bad signature", status: 401 };
  }

  const a = Buffer.from(given, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad signature", status: 401 };
  }

  return { ok: true };
}
