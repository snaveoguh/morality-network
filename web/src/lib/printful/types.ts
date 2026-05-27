// Domain types for the daily-drop pipeline. Real Printful API has many more
// fields — these are only what the pipeline cares about.

import type { Address, Hex } from "viem";

export interface DailyDrop {
  /** sequential drop number, 1-indexed, increases by 1 per UTC day */
  dropNumber: number;
  /** the editorial headline this drop is built around */
  headline: string;
  /** UTC date string YYYY-MM-DD */
  dateUTC: string;
  /** stable content hash derived from headline + date — used as idempotency key */
  contentHash: Hex;
  /** doc number on the tee, e.g. "PW-0042-A" */
  docNumber: string;
  /** unit cap for this drop */
  unitsTotal: number;
  /** how many units have been sold so far */
  unitsSold: number;
  /** retail price in USD cents */
  priceCents: number;
}

export interface DropProductRefs {
  /** Printful sync product id, set after upload completes */
  printfulSyncProductId: number | null;
  /** Printful catalog variant id used (Comfort Colors 1717, black, L, etc.) */
  printfulCatalogVariantId: number;
  /** PNG file id Printful holds for the print artwork */
  printfulPrintFileId: number | null;
  /** public URL of the rendered design PNG */
  printArtworkUrl: string | null;
  /** url the customer is sent to in order to check out */
  checkoutUrl: string | null;
}

export interface PrintfulSyncProductCreatePayload {
  sync_product: { name: string; thumbnail?: string };
  sync_variants: Array<{
    variant_id: number;
    retail_price: string;
    files: Array<{ id: number; type: "front" }>;
  }>;
}

export interface PrintfulFileUploadResponse {
  id: number;
  url: string;
  thumbnail_url: string;
  preview_url: string;
  status: "ok" | "waiting" | "failed";
}
