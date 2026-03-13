import "server-only";

import { cookies } from "next/headers";
import { getIronSession, type IronSession } from "iron-session";

export interface SessionData {
  address?: string;
  chainId?: number;
  nonce?: string;
  siweIssuedAt?: string;
}

export const sessionOptions = {
  password:
    process.env.SESSION_SECRET ||
    "morality-network-v2-session-secret-change-in-production-32chars!",
  cookieName: "morality-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 1 week
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
