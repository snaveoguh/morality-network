import { NextRequest, NextResponse } from 'next/server';
import { verifyMessage } from 'viem';

// In-memory store for MVP. Replace with Prisma/DB in production.
const usernames = new Map<string, {
  username: string;
  evmAddress: string;
  solanaAddress: string | null;
  createdAt: string;
}>();
const addressToUsername = new Map<string, string>();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export async function POST(request: NextRequest) {
  try {
    const { username, evmAddress, solanaAddress, signature, message } = await request.json();

    // Validate username format
    if (!username || !USERNAME_RE.test(username)) {
      return NextResponse.json(
        { success: false, error: 'Username must be 3-20 chars, alphanumeric + underscore only' },
        { status: 400 },
      );
    }

    // Validate required fields
    if (!evmAddress || !signature || !message) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 },
      );
    }

    // Verify EIP-191 signature
    const isValid = await verifyMessage({
      address: evmAddress as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid signature' },
        { status: 401 },
      );
    }

    // Check username uniqueness
    const lowerUsername = username.toLowerCase();
    if (usernames.has(lowerUsername)) {
      return NextResponse.json(
        { success: false, error: 'Username already taken' },
        { status: 409 },
      );
    }

    // Check address uniqueness
    const lowerAddr = evmAddress.toLowerCase();
    if (addressToUsername.has(lowerAddr)) {
      return NextResponse.json(
        { success: false, error: 'Address already has a username' },
        { status: 409 },
      );
    }

    // Store
    const record = {
      username,
      evmAddress: lowerAddr,
      solanaAddress: solanaAddress || null,
      createdAt: new Date().toISOString(),
    };

    usernames.set(lowerUsername, record);
    addressToUsername.set(lowerAddr, lowerUsername);
    if (solanaAddress) {
      addressToUsername.set(solanaAddress, lowerUsername);
    }

    return NextResponse.json({ success: true, username });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Registration failed' },
      { status: 500 },
    );
  }
}
