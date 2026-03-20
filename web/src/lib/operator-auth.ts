import "server-only";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export interface OperatorAuthState {
  authorized: boolean;
  via: "bearer" | "session" | "development" | null;
  address: string | null;
  misconfigured: boolean;
}

function splitCsv(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function getOperatorAllowlist(): Set<string> {
  return new Set([
    ...splitCsv(process.env.OPERATOR_ADDRESSES),
    ...splitCsv(process.env.GOD_MODE_ADDRESSES),
  ]);
}

function getBearerSecrets(): string[] {
  return [
    process.env.CRON_SECRET?.trim(),
    process.env.GOD_MODE_SECRET?.trim(),
  ].filter((value): value is string => Boolean(value));
}

export async function getSessionAddress(): Promise<string | null> {
  try {
    const session = await getSession();
    return session.address?.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

export async function getOperatorAuthState(
  request: Request,
): Promise<OperatorAuthState> {
  if (process.env.NODE_ENV !== "production") {
    return {
      authorized: true,
      via: "development",
      address: null,
      misconfigured: false,
    };
  }

  const bearerSecrets = getBearerSecrets();
  const allowlist = getOperatorAllowlist();
  const auth = request.headers.get("authorization")?.trim();

  if (auth && bearerSecrets.some((secret) => auth === `Bearer ${secret}`)) {
    return {
      authorized: true,
      via: "bearer",
      address: null,
      misconfigured: false,
    };
  }

  const sessionAddress = await getSessionAddress();
  if (sessionAddress && allowlist.has(sessionAddress)) {
    return {
      authorized: true,
      via: "session",
      address: sessionAddress,
      misconfigured: false,
    };
  }

  return {
    authorized: false,
    via: null,
    address: sessionAddress,
    misconfigured: bearerSecrets.length === 0 && allowlist.size === 0,
  };
}

export async function verifyOperatorAuth(
  request: Request,
): Promise<NextResponse | null> {
  const state = await getOperatorAuthState(request);
  if (state.authorized) {
    return null;
  }

  if (state.misconfigured) {
    return NextResponse.json(
      { error: "Operator auth not configured" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401 },
  );
}

export async function sessionMatchesAddress(
  candidate: string | null | undefined,
): Promise<boolean> {
  if (!candidate) return false;
  const sessionAddress = await getSessionAddress();
  return sessionAddress === candidate.trim().toLowerCase();
}
