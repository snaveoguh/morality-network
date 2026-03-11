import { NextResponse } from "next/server";
import {
  CLAIM_SOURCE_KINDS,
  DELIBERATION_SCHEMA_VERSION,
  INTERPRETATION_KINDS,
  OUTCOME_STATES,
} from "@/lib/types/deliberation";

export async function GET() {
  return NextResponse.json({
    data: {
      schemaVersion: DELIBERATION_SCHEMA_VERSION,
      model: "entity -> claim -> interpretation -> evidence -> outcome",
      claimSourceKinds: CLAIM_SOURCE_KINDS,
      interpretationKinds: INTERPRETATION_KINDS,
      outcomeStates: OUTCOME_STATES,
    },
    meta: {
      generatedAt: Date.now(),
    },
  });
}

