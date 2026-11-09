import "server-only";

import { getPublicCoop, listPublicCoops } from "@/lib/db/coop-pipeline";
import type { PipelineCoop, PipelineEvent } from "./types";

// Pages render without Postgres (local dev, or before migration 017 has run):
// the register snapshot still shows and the pipeline section says so.

export interface PipelineRead {
  coops: PipelineCoop[];
  available: boolean;
}

export async function readPipeline(area: string): Promise<PipelineRead> {
  if (!process.env.DATABASE_URL) return { coops: [], available: false };
  try {
    return { coops: await listPublicCoops(area), available: true };
  } catch (err) {
    console.error("[coops] pipeline read failed:", err);
    return { coops: [], available: false };
  }
}

export async function readCoop(
  slug: string,
): Promise<{ coop: PipelineCoop; events: PipelineEvent[] } | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    return await getPublicCoop(slug);
  } catch (err) {
    console.error("[coops] co-op read failed:", err);
    return null;
  }
}

export function formatPounds(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(pence / 100);
}
