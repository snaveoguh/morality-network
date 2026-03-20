import { NextRequest, NextResponse } from "next/server";
import { getArchivedEditorial, saveEditorial } from "@/lib/editorial-archive";
import { saveIllustration } from "@/lib/illustration-store";
import type { ArticleContent } from "@/lib/article";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * God mode addresses — these wallets can edit any editorial.
 * Edits are persisted to the editorial archive (Redis + file).
 */
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

  // Verify god mode
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
      await saveIllustration(hash, {
        base64: edits.illustrationBase64,
        prompt: `Uploaded by ${wallet.toLowerCase()} via god mode`,
        revisedPrompt: null,
      });
      updated.hasIllustration = true;
      console.log(`[editorial/edit] Illustration uploaded for ${hash.slice(0, 14)} by ${wallet.slice(0, 10)}`);
    } catch (err) {
      console.warn("[editorial/edit] Failed to save illustration:", err instanceof Error ? err.message : err);
    }
  }

  // Save back — this persists to Redis + file + remote indexer
  await saveEditorial(hash, updated, existing.generatedBy);

  return NextResponse.json({
    success: true,
    hash,
    editedBy: wallet.toLowerCase(),
    editCount: updated.editCount,
    illustrationUploaded: !!edits.illustrationBase64,
  });
}
