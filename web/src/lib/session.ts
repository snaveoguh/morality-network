import "server-only";

import { cookies } from "next/headers";
import { getIronSession, type IronSession } from "iron-session";

export interface SessionData {
  address?: string;
  chainId?: number;
  nonce?: string;
  siweIssuedAt?: string;
}

/**
 * Build session options lazily — SESSION_SECRET is only available at runtime
 * on Vercel, not during `next build`. Throws in production if missing.
 */
function getSessionOptions() {
  const secret = process.env.SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET environment variable is required in production",
    );
  }
  return {
    password:
      secret || "dev-only-morality-session-secret-not-for-production!!",
    cookieName: "morality-session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 1 week
    },
  };
}

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), getSessionOptions());
}
