// Thin Printful API wrapper. Sketch only — TODOs mark the real implementation
// points. Drop in a PRINTFUL_API_KEY and PRINTFUL_STORE_ID env var to wire up.
//
// API docs: https://developers.printful.com/docs/v2/

import type {
  PrintfulFileUploadResponse,
  PrintfulSyncProductCreatePayload,
} from "./types";

const PRINTFUL_BASE = "https://api.printful.com";

function requireKey(): string {
  const key = process.env.PRINTFUL_API_KEY;
  if (!key) throw new Error("PRINTFUL_API_KEY not set");
  return key;
}

function requireStore(): string {
  const id = process.env.PRINTFUL_STORE_ID;
  if (!id) throw new Error("PRINTFUL_STORE_ID not set");
  return id;
}

async function pfFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PRINTFUL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireKey()}`,
      "Content-Type": "application/json",
      "X-PF-Store-Id": requireStore(),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Printful ${path} ${res.status}: ${body.slice(0, 240)}`);
  }
  const json = (await res.json()) as { code: number; result: T };
  return json.result;
}

/**
 * Upload a PNG print artwork. Returns a file id you reference when creating
 * the sync variant. Idempotency note: Printful dedupes by URL — pass the same
 * url twice and you get the same file id back.
 */
export async function uploadPrintFile(args: {
  url: string;
  filename: string;
}): Promise<PrintfulFileUploadResponse> {
  return pfFetch<PrintfulFileUploadResponse>("/files", {
    method: "POST",
    body: JSON.stringify({ url: args.url, filename: args.filename }),
  });
}

/**
 * Create a sync product (= a sellable variant in your store, backed by a
 * catalog product). For Comfort Colors 1717 black L the catalog variant id
 * is fixed — look it up once via /products and hardcode in env.
 */
export async function createSyncProduct(
  payload: PrintfulSyncProductCreatePayload,
): Promise<{ id: number }> {
  return pfFetch<{ id: number }>("/store/products", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Place an order programmatically (one per buyer). For the customer-facing
 * checkout flow, prefer the Printful-hosted checkout (Shopify-style hand-off)
 * over building our own — less compliance surface.
 *
 * TODO: decide checkout model — Printful-hosted vs Shopify embed vs custom
 * Stripe + Printful-on-demand-fulfillment.
 */
export async function createOrder(args: { sync_variant_id: number; recipient: unknown }): Promise<unknown> {
  // TODO: implement when checkout model is chosen
  void args;
  throw new Error("createOrder not implemented — pick checkout model first");
}
