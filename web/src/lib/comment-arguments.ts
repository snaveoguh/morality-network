export type CommentArgumentType = 0 | 1 | 2 | 3 | 4;

const PREFIX_BY_TYPE: Record<CommentArgumentType, string> = {
  0: "",
  1: "[CLAIM]",
  2: "[COUNTER]",
  3: "[EVIDENCE]",
  4: "[SOURCE]",
};

const PREFIX_PATTERNS: Array<{ type: CommentArgumentType; pattern: RegExp }> = [
  { type: 1, pattern: /^\[(CLAIM)\]\s*/i },
  { type: 2, pattern: /^\[(COUNTER|COUNTERCLAIM)\]\s*/i },
  { type: 3, pattern: /^\[(EVIDENCE)\]\s*/i },
  { type: 4, pattern: /^\[(SOURCE)\]\s*/i },
];

export function deriveArgumentTypeFromContent(content: string): CommentArgumentType {
  const normalized = content.trimStart();
  for (const entry of PREFIX_PATTERNS) {
    if (entry.pattern.test(normalized)) {
      return entry.type;
    }
  }
  return 0;
}

export function stripArgumentPrefix(content: string): string {
  const normalized = content.trimStart();
  for (const entry of PREFIX_PATTERNS) {
    if (entry.pattern.test(normalized)) {
      return normalized.replace(entry.pattern, "");
    }
  }
  return content;
}

export function encodeLegacyStructuredComment(
  argumentType: CommentArgumentType,
  content: string,
  options?: { referenceId?: string; evidenceUrl?: string }
): string {
  const trimmed = content.trim();
  if (!trimmed) return "";
  if (argumentType === 0) return trimmed;

  const lines: string[] = [`${PREFIX_BY_TYPE[argumentType]} ${trimmed}`];
  if (options?.referenceId) {
    lines.push(`Reference: #${options.referenceId}`);
  }
  if (options?.evidenceUrl) {
    lines.push(`Evidence: ${options.evidenceUrl}`);
  }
  return lines.join("\n\n");
}

export interface NormalizedArgumentMeta {
  argumentType: CommentArgumentType;
  referenceCommentId: bigint;
  evidenceHash: string;
  exists: boolean;
}

export function normalizeArgumentMeta(raw: unknown): NormalizedArgumentMeta {
  if (!raw) {
    return { argumentType: 0, referenceCommentId: BigInt(0), evidenceHash: "", exists: false };
  }

  if (Array.isArray(raw)) {
    return {
      argumentType: Number(raw[0] ?? 0) as CommentArgumentType,
      referenceCommentId: BigInt(raw[1] ?? 0),
      evidenceHash: String(raw[2] ?? ""),
      exists: Boolean(raw[3] ?? false),
    };
  }

  if (typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    return {
      argumentType: Number(record.argumentType ?? 0) as CommentArgumentType,
      referenceCommentId: BigInt((record.referenceCommentId as string | number | bigint) ?? 0),
      evidenceHash: String(record.evidenceHash ?? ""),
      exists: Boolean(record.exists ?? false),
    };
  }

  return { argumentType: 0, referenceCommentId: BigInt(0), evidenceHash: "", exists: false };
}

/** Parse "Evidence: <url>" and "Reference: #<id>" lines from legacy comment content */
export function parseLegacyEvidenceLines(content: string): {
  evidenceUrl: string | null;
  referenceId: string | null;
  cleanContent: string;
} {
  let evidenceUrl: string | null = null;
  let referenceId: string | null = null;
  const lines = content.split("\n");
  const kept: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const evMatch = trimmed.match(/^Evidence:\s*(https?:\/\/\S+)/i);
    if (evMatch) {
      evidenceUrl = evMatch[1];
      continue;
    }
    const refMatch = trimmed.match(/^Reference:\s*#?(\d+)/i);
    if (refMatch) {
      referenceId = refMatch[1];
      continue;
    }
    kept.push(line);
  }

  return {
    evidenceUrl,
    referenceId,
    cleanContent: kept.join("\n").trim(),
  };
}
