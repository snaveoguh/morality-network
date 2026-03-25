import { NextRequest, NextResponse } from 'next/server';

// Shared in-memory store with register route.
// In production, both routes read from the same Prisma DB.
// For MVP, we import from a shared module or duplicate the Maps.
// Since Next.js API routes share the same Node process, module-level
// state is shared — but only within the same deployment instance.

// For now, this is a placeholder that returns null.
// The register route stores data in memory; this route reads it.
// In production: replace with DB queries.

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');
  const username = searchParams.get('username');

  if (!address && !username) {
    return NextResponse.json(
      { error: 'Provide ?address= or ?username= query param' },
      { status: 400 },
    );
  }

  // TODO: Replace with actual DB lookup (Prisma)
  // For MVP, the in-memory Maps in register/route.ts are not accessible here
  // in production. Wire up Prisma or Upstash Redis.
  return NextResponse.json({
    username: null,
    evmAddress: null,
    solanaAddress: null,
    message: 'Username lookup requires database. Wire up Prisma for production.',
  });
}
