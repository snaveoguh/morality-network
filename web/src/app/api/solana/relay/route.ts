import { NextRequest, NextResponse } from 'next/server';
import { relayTransaction } from '@/lib/solana-relay';

// Simple in-memory rate limiter
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // requests per minute per IP
const RATE_WINDOW = 60_000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = requestCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export async function POST(request: NextRequest) {
  // Rate limit
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Max 30 requests per minute.' },
      { status: 429 },
    );
  }

  try {
    const body = await request.json();
    const { transaction } = body;

    if (!transaction || typeof transaction !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid transaction field (expected base64 string)' },
        { status: 400 },
      );
    }

    // Validate base64
    try {
      Buffer.from(transaction, 'base64');
    } catch {
      return NextResponse.json(
        { error: 'Invalid base64 encoding' },
        { status: 400 },
      );
    }

    const signature = await relayTransaction(transaction);

    return NextResponse.json({ signature });
  } catch (error: any) {
    const message = error.message || 'Relay failed';
    const status = message.includes('Blocked') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
