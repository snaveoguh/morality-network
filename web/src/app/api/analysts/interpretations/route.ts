import { NextResponse } from "next/server";
import {
  buildInterpretationOutcomeScores,
  parseInterpretationScoreQuery,
  toCanonicalInterpretation,
} from "@/lib/interpretation-scores";
import { DELIBERATION_SCHEMA_VERSION } from "@/lib/types/deliberation";

const CACHE_MS = 2 * 60 * 1000;
let cached:
  | (Awaited<ReturnType<typeof buildInterpretationOutcomeScores>> & {
      cacheTime: number;
      paramsKey: string;
    })
  | null = null;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = parseInterpretationScoreQuery(searchParams);

    const paramsKey = JSON.stringify({
      limit: parsed.limit,
      lookbackBlocks: parsed.lookbackBlocks.toString(),
      minOutcomeScore: parsed.minOutcomeScore,
      onlyCorrect: parsed.onlyCorrect,
      requireStructured: parsed.requireStructured,
      requireEvidence: parsed.requireEvidence,
    });

    const now = Date.now();
    if (cached && now - cached.cacheTime <= CACHE_MS && cached.paramsKey === paramsKey) {
      return NextResponse.json({ ...cached, cacheHit: true });
    }

    const snapshot = await buildInterpretationOutcomeScores(parsed);
    const canonicalInterpretations = snapshot.interpretations.map(toCanonicalInterpretation);

    const payload = {
      ...snapshot,
      schemaVersion: DELIBERATION_SCHEMA_VERSION,
      canonicalInterpretations,
      cacheHit: false,
      params: {
        ...parsed,
        lookbackBlocks: parsed.lookbackBlocks.toString(),
      },
    };

    cached = {
      ...payload,
      cacheTime: now,
      paramsKey,
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[api/analysts/interpretations] failed", error);
    return NextResponse.json(
      {
        error: "failed to compute interpretation outcome scores",
      },
      { status: 500 }
    );
  }
}
