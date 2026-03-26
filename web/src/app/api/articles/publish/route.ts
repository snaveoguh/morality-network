import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * POST /api/articles/publish
 * Creates a user-published article, stores it, and returns an entity hash
 * so it can be rated/tipped/discussed via the morality contracts.
 *
 * Body: { title, body, category, media: string[], author: string }
 */

// In-memory store for MVP. Replace with Prisma/Redis in production.
const articles = new Map<string, {
  slug: string;
  entityHash: string;
  title: string;
  body: string;
  category: string;
  media: string[];
  author: string;
  createdAt: string;
}>();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export async function POST(request: NextRequest) {
  try {
    const { title, body, category, media, author } = await request.json();

    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json(
        { error: 'Title and body are required' },
        { status: 400 },
      );
    }

    if (title.length > 120) {
      return NextResponse.json(
        { error: 'Title too long (max 120 chars)' },
        { status: 400 },
      );
    }

    if (body.length > 10_000) {
      return NextResponse.json(
        { error: 'Body too long (max 10,000 chars)' },
        { status: 400 },
      );
    }

    const slug = slugify(title);
    const articleUrl = `https://pooter.world/articles/${slug}`;

    // Entity hash matches on-chain: keccak256(url)
    const entityHash = crypto
      .createHash('sha256')
      .update(articleUrl)
      .digest('hex');

    const article = {
      slug,
      entityHash,
      title: title.trim(),
      body: body.trim(),
      category: category || 'general',
      media: Array.isArray(media) ? media.slice(0, 4) : [],
      author: author || 'anonymous',
      createdAt: new Date().toISOString(),
    };

    articles.set(entityHash, article);

    return NextResponse.json({
      slug,
      entityHash,
      url: articleUrl,
      message: 'Article published. Register the entity on-chain to enable ratings and tips.',
    });
  } catch (error: any) {
    console.error('Publish error:', error);
    return NextResponse.json(
      { error: error.message || 'Publish failed' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const hash = searchParams.get('hash');

  if (hash && articles.has(hash)) {
    return NextResponse.json(articles.get(hash));
  }

  // Return recent articles
  const recent = Array.from(articles.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50);

  return NextResponse.json({ articles: recent, total: articles.size });
}
