import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const REDIS_KEY = "newsletter:subscribers";

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/newsletter/subscribe
 * Add an email to The Daily Pooter subscriber list.
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const normalized = email.toLowerCase().trim();
    const redis = getRedis();

    if (!redis) {
      return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
    }

    // Check if already subscribed
    const exists = await redis.sismember(REDIS_KEY, normalized);
    if (exists) {
      return NextResponse.json({ status: "already_subscribed", email: normalized });
    }

    await redis.sadd(REDIS_KEY, normalized);
    const count = await redis.scard(REDIS_KEY);

    return NextResponse.json({ status: "subscribed", email: normalized, totalSubscribers: count });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/newsletter/subscribe
 * Unsubscribe an email.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

    const redis = getRedis();
    if (!redis) return NextResponse.json({ error: "Storage not configured" }, { status: 500 });

    await redis.srem(REDIS_KEY, email.toLowerCase().trim());
    return NextResponse.json({ status: "unsubscribed" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/newsletter/subscribe
 * Get subscriber count (public) or full list (auth required).
 */
export async function GET(request: NextRequest) {
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Storage not configured" }, { status: 500 });

  const count = await redis.scard(REDIS_KEY);

  // Full list only with auth
  const auth = request.headers.get("authorization")?.trim();
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && auth === `Bearer ${secret}`) {
    const subscribers = await redis.smembers(REDIS_KEY);
    return NextResponse.json({ count, subscribers });
  }

  return NextResponse.json({ count });
}
