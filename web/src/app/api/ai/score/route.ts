import { NextResponse } from "next/server";

interface ScoreRequest {
  identifier: string;
  entityType: "URL" | "DOMAIN" | "ADDRESS" | "CONTRACT";
  content?: string;
}

interface ScoreResult {
  credibility: number; // 0-100
  quality: number; // 0-100
  sentiment: string; // "positive" | "neutral" | "negative"
  flags: string[];
  summary: string;
}

// Placeholder AI scoring — replace with actual Claude/OpenAI API call
async function scoreEntity(req: ScoreRequest): Promise<ScoreResult> {
  // In production, this calls Claude API or OpenAI for:
  // - Content quality analysis
  // - Credibility scoring
  // - Bias detection
  // - Scam detection (for addresses/contracts)
  //
  // Example prompt for Claude:
  // "Analyze this news source for credibility, bias, and content quality.
  //  Domain: {identifier}. Return a JSON score."

  // For now return mock scores based on entity type
  if (req.entityType === "DOMAIN") {
    return {
      credibility: 75 + Math.floor(Math.random() * 20),
      quality: 70 + Math.floor(Math.random() * 25),
      sentiment: "neutral",
      flags: [],
      summary: `Domain analysis for ${req.identifier}`,
    };
  }

  if (req.entityType === "ADDRESS" || req.entityType === "CONTRACT") {
    return {
      credibility: 50 + Math.floor(Math.random() * 40),
      quality: 60 + Math.floor(Math.random() * 30),
      sentiment: "neutral",
      flags: [],
      summary: `Address/contract analysis for ${req.identifier}`,
    };
  }

  // URL
  return {
    credibility: 60 + Math.floor(Math.random() * 30),
    quality: 55 + Math.floor(Math.random() * 35),
    sentiment: "neutral",
    flags: [],
    summary: `Content analysis for ${req.identifier}`,
  };
}

export async function POST(request: Request) {
  try {
    const body: ScoreRequest = await request.json();

    if (!body.identifier || !body.entityType) {
      return NextResponse.json(
        { error: "identifier and entityType required" },
        { status: 400 }
      );
    }

    const score = await scoreEntity(body);

    return NextResponse.json({
      identifier: body.identifier,
      entityType: body.entityType,
      score,
      // Composite for leaderboard (0-10000 scale matching contract)
      compositeAIScore: Math.round(
        ((score.credibility + score.quality) / 2) * 100
      ),
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "AI scoring failed" },
      { status: 500 }
    );
  }
}
