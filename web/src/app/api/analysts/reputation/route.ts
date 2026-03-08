import { NextResponse } from "next/server";
import { buildAnalystReputationFromPredictionMarkets } from "@/lib/analyst-reputation";

const CACHE_MS = 2 * 60 * 1000;
const DEFAULT_LOOKBACK_BLOCKS = BigInt("90000");
const MIN_LOOKBACK_BLOCKS = BigInt("5000");
const MAX_LOOKBACK_BLOCKS = BigInt("5000000");
let cached:
  | (Awaited<ReturnType<typeof buildAnalystReputationFromPredictionMarkets>> & {
      cacheTime: number;
    })
  | null = null;

function parseIntParam(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function parseBigIntParam(value: string | null, fallback: bigint, min: bigint, max: bigint): bigint {
  if (!value) return fallback;
  try {
    const parsed = BigInt(value);
    if (parsed < min) return min;
    if (parsed > max) return max;
    return parsed;
  } catch {
    return fallback;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const limit = parseIntParam(searchParams.get("limit"), 50, 1, 200);
    const minPredictions = parseIntParam(
      searchParams.get("minInterpretations") ?? searchParams.get("minPredictions"),
      2,
      1,
      100
    );
    const lookbackBlocks = parseBigIntParam(
      searchParams.get("lookbackBlocks"),
      DEFAULT_LOOKBACK_BLOCKS,
      MIN_LOOKBACK_BLOCKS,
      MAX_LOOKBACK_BLOCKS
    );

    const now = Date.now();
    if (
      cached &&
      now - cached.cacheTime <= CACHE_MS &&
      cached.analysts.length <= limit &&
      minPredictions <= 2 &&
      lookbackBlocks === DEFAULT_LOOKBACK_BLOCKS
    ) {
      return NextResponse.json({
        ...cached,
        cacheHit: true,
      });
    }

    const snapshot = await buildAnalystReputationFromPredictionMarkets({
      limit,
      minPredictions,
      lookbackBlocks,
    });

    const payload = {
      ...snapshot,
      cacheHit: false,
      params: {
        limit,
        minPredictions,
        minInterpretations: minPredictions,
        lookbackBlocks: lookbackBlocks.toString(),
      },
    };

    // Cache only default-style calls
    if (minPredictions <= 2 && lookbackBlocks === DEFAULT_LOOKBACK_BLOCKS) {
      cached = {
        ...payload,
        cacheTime: now,
      };
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[api/analysts/reputation] failed", error);
    return NextResponse.json(
      {
        error: "failed to compute analyst reputation",
      },
      { status: 500 }
    );
  }
}
