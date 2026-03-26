import { NextRequest, NextResponse } from "next/server";
import { computeEntityHash } from "@/lib/entity";
import { Redis } from "@upstash/redis";

/**
 * POST /api/articles/publish
 * Creates a user-published article, stores it in Redis,
 * and returns an entity hash for on-chain ratings/tips/discussion.
 *
 * Body: { title, body, category, media: string[], author: string }
 */

const REDIS_KEY_PREFIX = "user-article:";

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function POST(request: NextRequest) {
  try {
    const { title, body, category, media, author } = await request.json();

    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json(
        { error: "Title and body are required" },
        { status: 400 },
      );
    }

    if (title.length > 120) {
      return NextResponse.json(
        { error: "Title too long (max 120 chars)" },
        { status: 400 },
      );
    }

    if (body.length > 10_000) {
      return NextResponse.json(
        { error: "Body too long (max 10,000 chars)" },
        { status: 400 },
      );
    }

    const slug = slugify(title);
    const articleUrl = `https://pooter.world/articles/${slug}`;

    // Match on-chain entity hash (keccak256)
    const entityHash = computeEntityHash(articleUrl);

    const article = {
      slug,
      entityHash,
      title: title.trim(),
      body: body.trim(),
      category: category || "general",
      media: Array.isArray(media) ? media.slice(0, 4) : [],
      author: author || "anonymous",
      createdAt: new Date().toISOString(),
      source: "pooter.world",
      sourceUrl: articleUrl,
    };

    // Store in Redis (30-day TTL)
    const redis = getRedis();
    if (redis) {
      await redis.set(`${REDIS_KEY_PREFIX}${entityHash}`, JSON.stringify(article), {
        ex: 30 * 86400,
      });
      // Add to recent articles list
      await redis.lpush("user-articles:recent", entityHash);
      await redis.ltrim("user-articles:recent", 0, 199); // keep last 200
    }

    return NextResponse.json({
      slug,
      entityHash,
      url: articleUrl,
      message:
        "Article published. Register the entity on-chain to enable ratings and tips.",
    });
  } catch (error: any) {
    console.error("Publish error:", error);
    return NextResponse.json(
      { error: error.message || "Publish failed" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const hash = searchParams.get("hash");

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 500 });
  }

  if (hash) {
    const raw = await redis.get(`${REDIS_KEY_PREFIX}${hash}`);
    if (raw) {
      const article = typeof raw === "string" ? JSON.parse(raw) : raw;
      return NextResponse.json(article);
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Return recent articles
  const hashes = await redis.lrange("user-articles:recent", 0, 49);
  const articles = await Promise.all(
    hashes.map(async (h: string) => {
      const raw = await redis.get(`${REDIS_KEY_PREFIX}${h}`);
      return raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null;
    }),
  );

  return NextResponse.json({
    articles: articles.filter(Boolean),
    total: articles.filter(Boolean).length,
  });
}
