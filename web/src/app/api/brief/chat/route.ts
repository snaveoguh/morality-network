import { NextResponse } from "next/server";
import { answerBriefQuestion, CHAT_MAX_QUESTION, isBriefTopic } from "@/lib/day-brief";
import type { ChatTurn } from "@/lib/day-brief-types";
import { rateLimit } from "@/lib/rate-limit";

// POST /api/brief/chat — questions about the last 24 hours of news, answered
// only from the feed (lib/day-brief.ts). Public, so it is rate limited per
// visitor and capped per day across the site to bound AI spend.
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const DAILY_CAP = Number(process.env.BRIEF_CHAT_DAILY_CAP) || 3000;
let day = "";
let used = 0;

function underDailyCap(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    used = 0;
  }
  if (used >= DAILY_CAP) return false;
  used += 1;
  return true;
}

function parseHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (t): t is ChatTurn =>
        !!t && (t.role === "user" || t.role === "assistant") && typeof t.text === "string",
    )
    .slice(-4);
}

export async function POST(request: Request) {
  const limited = rateLimit(request, { maxRequests: 8, windowMs: 60_000 });
  if (limited) return limited;

  let body: { question?: unknown; topic?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return NextResponse.json({ error: "Ask a question" }, { status: 400 });
  if (question.length > CHAT_MAX_QUESTION) {
    return NextResponse.json({ error: "Question is too long" }, { status: 400 });
  }
  const topic = isBriefTopic(body.topic) ? body.topic : "all";

  if (!underDailyCap()) {
    return NextResponse.json(
      { answer: "The assistant has answered all it can for today. The rundown above still covers the day.", sources: [], available: false },
      { status: 200 },
    );
  }

  try {
    const answer = await answerBriefQuestion(question, topic, parseHistory(body.history));
    return NextResponse.json(answer);
  } catch (error) {
    console.warn("[brief-chat] failed:", error);
    return NextResponse.json({ error: "The assistant could not answer just now. Try again in a moment." }, { status: 502 });
  }
}
