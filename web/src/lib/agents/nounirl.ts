const NOUNIRL_TRAIT_ORDER = [
  "background",
  "body",
  "accessory",
  "head",
  "glasses",
] as const;

const NOUNIRL_TRAIT_SHORT_LABELS: Record<string, string> = {
  background: "BG",
  body: "BD",
  accessory: "AC",
  head: "HD",
  glasses: "GL",
};

export interface NounIrlTraitChip {
  key: string;
  category: string;
  label: string;
  shortLabel: string;
}

export interface NounIrlSeed {
  background: number;
  body: number;
  accessory: number;
  head: number;
  glasses: number;
}

export interface NounIrlCardData {
  block: number | null;
  nextNounId: number | null;
  wallet: string | null;
  transport: string | null;
  bridge: string | null;
  canDeploy: boolean | null;
  checkedAt: number | null;
  seed: NounIrlSeed | null;
  auctionEnd: number | null;
  traits: NounIrlTraitChip[];
  watching: NounIrlTraitChip[];
}

export interface NounIrlAgentSnapshot {
  id: "nounirl";
  name: "NounIRL";
  description: string;
  status: string;
  startedAt: null;
  lastActivityAt: number | null;
  stats: Record<string, number>;
  errors: string[];
  remote: true;
  source: string;
  subscriptions: string[];
  stream: string;
  nounirl: NounIrlCardData;
}

interface BuildNounIrlAgentSnapshotOptions {
  bridgeTopics: string[];
  bridgeUrl: string;
  siteUrl?: string | null;
  statusPayload?: unknown;
  predictPayload?: unknown;
  reservationsPayload?: unknown;
}

type JsonRecord = Record<string, unknown>;

export function buildNounIrlAgentSnapshot(
  options: BuildNounIrlAgentSnapshotOptions,
): NounIrlAgentSnapshot {
  const statusData = asRecord(options.statusPayload);
  const predictData = asRecord(options.predictPayload);
  const reservationsPayload = options.reservationsPayload;
  const reservationStats = asRecord(statusData?.reservations);

  const currentBlock =
    asNumber(predictData?.block) ??
    asNumber(statusData?.currentBlock) ??
    asNumber(statusData?.lastBlock);
  const nextNounId =
    asNumber(predictData?.nextNounId) ?? asNumber(statusData?.nextNounId);
  const checkedAt =
    asTimestampMs(predictData?.checkedAt) ??
    asTimestampMs(statusData?.lastCheckedAt);
  const reservationCount =
    asNumber(reservationStats?.total) ??
    asNumber(statusData?.reservationCount) ??
    countReservations(reservationsPayload);
  const settlementCount =
    asNumber(reservationStats?.totalSettlements) ??
    asNumber(statusData?.settlementCount) ??
    0;
  const errors = asStringArray(statusData?.errors);
  const running =
    asBoolean(predictData?.running) ?? asBoolean(statusData?.running) ?? false;

  const stats: Record<string, number> = {
    reservations: reservationCount ?? 0,
    settlements: settlementCount,
  };
  if (currentBlock != null) {
    stats.currentBlock = currentBlock;
  }
  if (nextNounId != null) {
    stats.nextNoun = nextNounId;
  }

  const siteUrl = options.siteUrl?.replace(/\/$/, "") ?? "";

  return {
    id: "nounirl",
    name: "NounIRL",
    description: "Autonomous Noun trait sniper and settler",
    status: errors.length > 0 ? "error" : running ? "running" : "idle",
    startedAt: null,
    lastActivityAt: checkedAt,
    stats,
    errors,
    remote: true,
    source: options.bridgeUrl,
    subscriptions: options.bridgeTopics,
    stream: `${siteUrl}/api/agents/events/stream?topic=${encodeURIComponent(options.bridgeTopics.join(","))}`,
    nounirl: {
      block: currentBlock,
      nextNounId,
      wallet: asString(statusData?.wallet),
      transport: asString(statusData?.transport),
      bridge: asString(statusData?.bridge),
      canDeploy: asBoolean(statusData?.canDeploy),
      checkedAt,
      seed: parseSeed(predictData?.seed ?? statusData?.seed),
      auctionEnd: asTimestampMs(predictData?.auctionEnd ?? statusData?.auctionEnd),
      traits: normalizeNounIrlTraitMap(
        predictData?.traits ?? statusData?.predictedTraits,
      ),
      watching: normalizeNounIrlWatching(
        reservationsPayload,
        statusData?.watching,
        statusData?.watchedTraits,
      ),
    },
  };
}

export function normalizeNounIrlTraitMap(source: unknown): NounIrlTraitChip[] {
  const traits = asRecord(source);
  if (!traits) {
    return [];
  }

  const normalized: NounIrlTraitChip[] = [];

  for (const category of NOUNIRL_TRAIT_ORDER) {
    const label = asString(traits[category]);
    if (!label) {
      continue;
    }
    normalized.push(toTraitChip(category, label));
  }

  for (const [category, value] of Object.entries(traits)) {
    if (NOUNIRL_TRAIT_ORDER.includes(category as (typeof NOUNIRL_TRAIT_ORDER)[number])) {
      continue;
    }
    const label = asString(value);
    if (!label) {
      continue;
    }
    normalized.push(toTraitChip(category, label));
  }

  return normalized;
}

export function normalizeNounIrlWatching(...sources: unknown[]): NounIrlTraitChip[] {
  const seen = new Set<string>();
  const normalized: NounIrlTraitChip[] = [];

  for (const source of sources) {
    for (const rawTrait of collectWatchedTraitStrings(source)) {
      const trait = parseWatchedTrait(rawTrait);
      if (!trait || seen.has(trait.key)) {
        continue;
      }
      seen.add(trait.key);
      normalized.push(trait);
    }
  }

  return normalized;
}

function collectWatchedTraitStrings(source: unknown): string[] {
  if (!source) {
    return [];
  }

  if (Array.isArray(source)) {
    return source.flatMap((item) => collectWatchedTraitStrings(item));
  }

  const record = asRecord(source);
  if (!record) {
    return typeof source === "string" ? [source] : [];
  }

  const directArrays = [
    record.traits,
    record.watching,
    record.watchedTraits,
    record.filters,
  ];

  const collected = directArrays.flatMap((value) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [],
  );

  if (Array.isArray(record.reservations)) {
    for (const reservation of record.reservations) {
      const reservationRecord = asRecord(reservation);
      if (!reservationRecord) {
        continue;
      }
      const status = asString(reservationRecord.status)?.toLowerCase();
      if (
        status &&
        status !== "active" &&
        status !== "pending" &&
        status !== "watching" &&
        status !== "open"
      ) {
        continue;
      }
      collected.push(
        ...collectWatchedTraitStrings(reservationRecord.traits),
      );
    }
  }

  return collected;
}

function parseWatchedTrait(rawTrait: string): NounIrlTraitChip | null {
  const cleaned = rawTrait.trim();
  if (!cleaned) {
    return null;
  }

  const separatorIndex = cleaned.indexOf(":");
  if (separatorIndex === -1) {
    return toTraitChip("watch", cleaned);
  }

  const category = cleaned.slice(0, separatorIndex).trim() || "watch";
  const label = cleaned.slice(separatorIndex + 1).trim();
  if (!label) {
    return null;
  }

  return toTraitChip(category, label);
}

function toTraitChip(category: string, label: string): NounIrlTraitChip {
  const normalizedCategory = humanizeSlug(category).toLowerCase();
  const normalizedLabel = humanizeLabel(label);

  return {
    key: `${normalizedCategory}:${normalizedLabel.toLowerCase()}`,
    category: normalizedCategory,
    label: normalizedLabel,
    shortLabel:
      NOUNIRL_TRAIT_SHORT_LABELS[normalizedCategory] ??
      normalizedCategory.slice(0, 2).toUpperCase(),
  };
}

function countReservations(source: unknown): number | null {
  if (!source) {
    return null;
  }

  const record = asRecord(source);
  if (!record || !Array.isArray(record.reservations)) {
    return null;
  }

  return record.reservations.length;
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asTimestampMs(value: unknown): number | null {
  const parsed = asNumber(value);
  if (parsed == null) {
    return null;
  }
  return parsed >= 1_000_000_000_000 ? parsed : parsed * 1000;
}

function humanizeSlug(value: string): string {
  return value.replace(/[_-]+/g, " ").trim().toLowerCase();
}

function parseSeed(value: unknown): NounIrlSeed | null {
  const record = asRecord(value);
  if (!record) return null;
  const bg = asNumber(record.background);
  const body = asNumber(record.body);
  const accessory = asNumber(record.accessory);
  const head = asNumber(record.head);
  const glasses = asNumber(record.glasses);
  if (bg == null || body == null || accessory == null || head == null || glasses == null) return null;
  return { background: bg, body, accessory, head, glasses };
}

function humanizeLabel(value: string): string {
  const cleaned = value.replace(/[_-]+/g, " ").trim();
  if (!cleaned) {
    return value;
  }
  if (/[A-Z]/.test(cleaned)) {
    return cleaned;
  }
  return cleaned.replace(/\b\w/g, (character) => character.toUpperCase());
}
