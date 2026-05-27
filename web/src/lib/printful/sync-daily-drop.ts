// =============================================================================
// DAILY-DROP PIPELINE — orchestration sketch
// =============================================================================
//
// Once per UTC day, just after the newsroom agent publishes the day's
// editorial, this runs:
//
//   1. fetchTodaysHeadline()         → getDailyEdition() in @/lib/daily-edition
//   2. renderDesignPng(headline)     → POST /api/og/drop?date=YYYY-MM-DD
//      returns a stable signed URL to the rendered PNG
//   3. uploadPrintFile(pngUrl)       → Printful file id
//   4. createSyncProduct(...)        → Printful sync product id + variant id
//   5. recordDrop(dropNumber, refs)  → Postgres `drops` table
//   6. announce(drop)                → Farcaster post via pooter1 agent
//
// Trigger: a Railway cron job at 00:05 UTC daily (newsroom agent runs at 00:00).
// Idempotency: keyed on contentHash = keccak256(headline + dateUTC). If a row
// already exists for that hash, skip — never re-create the Printful product.
//
// =============================================================================
//
// Open decisions before this can ship:
//
//   A. PNG renderer choice
//      Options:
//        (i)  @vercel/og (Satori) — simple, no extra infra, but limited CSS:
//             no CSS Grid, no mix-blend-mode, no text-indent. MemoTeeDesign
//             would need a Flexbox-only variant.
//        (ii) Playwright headless — true CSS support, can render the existing
//             component verbatim, but needs a separate Railway service with
//             chromium ~300MB. Heavier but visually faithful.
//      Recommendation: start with (i) on a Satori-friendly variant of the
//      design (`MemoTeeDesignFlat`), upgrade to (ii) only if the design
//      loses too much fidelity.
//
//   B. Catalog variant
//      Comfort Colors 1717 Graphite, Large, front print. Printful's catalog
//      product id ~71, variant id needs to be looked up once.
//      TODO: run `curl /products/71` and hardcode PRINTFUL_VARIANT_ID env var.
//
//   C. Print artwork URL
//      Printful pulls the PNG from a URL. Options:
//        - S3 bucket the app uploads to first (more moving parts)
//        - Serve directly from /api/og/drop?date=… (simplest, but the URL must
//          remain stable forever — once Printful pulls it, the URL can return
//          a different image, but for audit / reorder it should be stable)
//      Recommendation: upload to S3 (bucket already exists per
//      `morality.s3.eu-west-2.amazonaws.com`), key = `drops/${contentHash}.png`,
//      idempotent.
//
//   D. Storage
//      New Postgres table `pooter.drops`:
//        id              serial pk
//        drop_number     int    unique
//        date_utc        date   unique
//        headline        text
//        content_hash    bytea  unique
//        doc_number      text
//        units_total     int    default 15
//        units_sold      int    default 0
//        price_cents     int    default 4400
//        printful_sync_product_id  int
//        printful_variant_id       int
//        printful_print_file_id    int
//        artwork_url     text
//        checkout_url    text
//        created_at      timestamptz
//        TODO: schema migration in /indexer or wherever the pooter schema is
//        managed.
//
//   E. Checkout
//      Hand off to Printful-hosted checkout for v1 (Stripe via Printful, ZERO
//      compliance work for us). Upgrade to native Stripe + Printful order API
//      later if the daily-drop flow needs custom UX (queue, randomization,
//      verified-holder discount, etc.)
//
// =============================================================================

import type { DailyDrop, DropProductRefs } from "./types";

export interface SyncResult {
  dropNumber: number;
  status: "created" | "already-exists" | "failed";
  refs: DropProductRefs | null;
  error?: string;
}

/**
 * Run the daily drop pipeline. Idempotent — safe to invoke twice for the
 * same UTC date; the second call will return { status: "already-exists" }.
 *
 * TODO: implement. The shape below is the contract the caller depends on.
 */
export async function syncDailyDrop(): Promise<SyncResult> {
  // 1. const headline = await fetchTodaysHeadline();
  // 2. const drop = await ensureDropRow(headline);
  //    if (drop.alreadyExisted) return { status: "already-exists", … }
  // 3. const pngUrl = await renderAndUploadDesignPng(drop);
  // 4. const printFile = await uploadPrintFile({ url: pngUrl, filename: `${drop.contentHash}.png` });
  // 5. const product = await createSyncProduct(buildPayload(drop, printFile.id));
  // 6. await recordPrintfulRefs(drop, { printFile, product });
  // 7. await announceDropOnFarcaster(drop);
  // return { status: "created", refs }
  throw new Error("syncDailyDrop not implemented — see design notes above");
}

/**
 * Render the day's MemoTeeDesign to PNG and upload to S3 / serve from a
 * stable URL. See open decision (A) in the header comment.
 */
export async function renderDesignPng(_drop: DailyDrop): Promise<string> {
  // TODO: pick renderer (vercel/og or playwright), generate PNG, upload to S3
  // at key `drops/${drop.contentHash}.png`, return public URL.
  throw new Error("renderDesignPng not implemented — see design notes above");
}
