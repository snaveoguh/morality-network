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

export function normalizeArgumentMeta(raw: unknown): {
  argumentType: CommentArgumentType;
  exists: boolean;
} {
  if (!raw) {
    return { argumentType: 0, exists: false };
  }

  if (Array.isArray(raw)) {
    return {
      argumentType: Number(raw[0] ?? 0) as CommentArgumentType,
      exists: Boolean(raw[3] ?? false),
    };
  }

  if (typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    return {
      argumentType: Number(record.argumentType ?? 0) as CommentArgumentType,
      exists: Boolean(record.exists ?? false),
    };
  }

  return { argumentType: 0, exists: false };
}
