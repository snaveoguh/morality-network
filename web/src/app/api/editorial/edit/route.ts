import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { getArchivedEditorial, saveEditorial } from "@/lib/editorial-archive";
import { saveIllustration } from "@/lib/illustration-store";
import { computeEntityHash } from "@/lib/entity";
import type { ArticleContent } from "@/lib/article";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * God mode addresses — these wallets can edit any editorial.
 * Edits are persisted to the editorial archive (Redis + file).
 *
 * Security:
 *   1. SIWE session auth (preferred) — wallet proven via Sign-In with Ethereum
 *   2. Bearer token (GOD_MODE_SECRET) — for server-side / cron callers only
 *   3. Wallet allowlist (GOD_MODE_ADDRESSES) — limits to specific addresses
 */
const GOD_MODE_SECRET = process.env.GOD_MODE_SECRET?.trim() || "";
const GOD_MODE_ADDRESSES = new Set(
  (process.env.GOD_MODE_ADDRESSES || "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean),
);

interface EditRequestBody {
  hash: string;
  wallet: string;
  edits: {
    headline?: string;
    subheadline?: string;
    editorialBody?: string[];
    claim?: string;
    tags?: string[];
    dailyTitle?: string;
    /** Base64-encoded PNG for illustration replacement */
    illustrationBase64?: string;
  };
}

export async function POST(request: NextRequest) {
  // Auth: accept SIWE session OR Bearer token
  const auth = request.headers.get("authorization")?.trim();
  const hasBearer = GOD_MODE_SECRET && auth === `Bearer ${GOD_MODE_SECRET}`;

  let sessionAddress: string | undefined;
  if (!hasBearer) {
    try {
      const session = await getSession();
      sessionAddress = session.address?.toLowerCase();
    } catch {
      // No session available
    }
  }

  if (process.env.NODE_ENV === "production" && !hasBearer && !sessionAddress) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: EditRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { hash, wallet, edits } = body;
  if (!hash || !wallet || !edits) {
    return NextResponse.json({ error: "Missing hash, wallet, or edits" }, { status: 400 });
  }

  // If using session auth, wallet in body must match session wallet
  if (sessionAddress && wallet.toLowerCase() !== sessionAddress) {
    return NextResponse.json({ error: "Wallet mismatch" }, { status: 403 });
  }

  // Wallet allowlist (limits which addresses can edit)
  if (!GOD_MODE_ADDRESSES.has(wallet.toLowerCase())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Load existing editorial
  const existing = await getArchivedEditorial(hash);
  if (!existing) {
    return NextResponse.json({ error: "Editorial not found" }, { status: 404 });
  }

  // Apply edits
  const updated: ArticleContent = {
    ...existing,
    primary: {
      ...existing.primary,
      title: edits.headline ?? existing.primary.title,
    },
    subheadline: edits.subheadline ?? existing.subheadline,
    editorialBody: edits.editorialBody ?? existing.editorialBody,
    claim: edits.claim ?? existing.claim,
    tags: edits.tags ?? existing.tags,
    // Track the edit
    editedBy: wallet.toLowerCase(),
    editedAt: new Date().toISOString(),
    editCount: (existing.editCount ?? 0) + 1,
  };

  // Also update dailyTitle if this is a daily edition
  if (edits.dailyTitle && existing.isDailyEdition) {
    (updated as unknown as Record<string, unknown>).dailyTitle = edits.dailyTitle;
  }

  // Handle illustration upload — save to illustration store
  if (edits.illustrationBase64) {
    try {
      const illustrationData = {
        base64: edits.illustrationBase64,
        prompt: `Uploaded by ${wallet.toLowerCase()} via god mode`,
        revisedPrompt: null,
      };
      // Save under entity hash
      await saveIllustration(hash, illustrationData);

      // For daily editions, also save under the daily-edition hash
      // (the illustration route looks up by daily hash, not entity hash)
      if (existing.isDailyEdition) {
        const genDate = new Date(existing.generatedAt);
        const y = genDate.getUTCFullYear();
        const m = String(genDate.getUTCMonth() + 1).padStart(2, "0");
        const d = String(genDate.getUTCDate()).padStart(2, "0");
        const dailyHash = computeEntityHash(`pooter-daily-${y}-${m}-${d}`);
        if (dailyHash !== hash) {
          await saveIllustration(dailyHash, illustrationData);
          console.log(`[editorial/edit] Also saved illustration under daily hash ${dailyHash.slice(0, 14)}`);
        }
      }

      updated.hasIllustration = true;
      console.log(`[editorial/edit] Illustration uploaded for ${hash.slice(0, 14)} by ${wallet.slice(0, 10)}`);
    } catch (err) {
      console.warn("[editorial/edit] Failed to save illustration:", err instanceof Error ? err.message : err);
    }
  }

  // Save back — this persists to Redis + file + remote indexer
  await saveEditorial(hash, updated, existing.generatedBy);

  // Bust ISR cache so edits are visible to all visitors immediately
  try {
    revalidatePath(`/article/${hash}`);
    // OG/Twitter image routes have their own 24h revalidate — bust them too
    // so an uploaded cover photo becomes the share card without waiting a day.
    if (edits.illustrationBase64) {
      revalidatePath(`/article/${hash}/opengraph-image`);
      revalidatePath(`/article/${hash}/twitter-image`);
    }
    // Also revalidate the illustration endpoint if an image was uploaded
    if (edits.illustrationBase64 && existing.isDailyEdition) {
      const genDate = new Date(existing.generatedAt);
      const EPOCH = 1741651200;
      const SECONDS_PER_DAY = 86400;
      const editionTs = Math.floor(genDate.getTime() / 1000);
      const tokenId = Math.floor((editionTs - EPOCH) / SECONDS_PER_DAY) + 1;
      if (tokenId > 0) {
        revalidatePath(`/api/edition/${tokenId}/illustration`);
      }
    }
  } catch {
    // Non-fatal — page will still refresh on next ISR cycle
  }

  return NextResponse.json({
    success: true,
    hash,
    editedBy: wallet.toLowerCase(),
    editCount: updated.editCount,
    illustrationUploaded: !!edits.illustrationBase64,
  });
}
