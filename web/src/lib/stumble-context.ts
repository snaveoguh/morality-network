const STUMBLE_CONTEXT_KEY = "pooter:stumble-context:v1";
const MAX_STORED_ENTRIES = 600;
const MAX_ENTRY_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export interface StumbleContextEntry {
  hash: `0x${string}`;
  url?: string;
  title: string;
  source: string;
  type: string;
  description?: string;
  savedAt: string;
}

type ContextMap = Record<string, StumbleContextEntry>;

function readStore(): ContextMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STUMBLE_CONTEXT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ContextMap;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeStore(map: ContextMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STUMBLE_CONTEXT_KEY, JSON.stringify(map));
  } catch {
    // best-effort cache only
  }
}

function pruneStore(map: ContextMap): ContextMap {
  const now = Date.now();
  const entries = Object.entries(map).filter(([, value]) => {
    const ts = Date.parse(value.savedAt);
    if (!Number.isFinite(ts)) return false;
    return now - ts <= MAX_ENTRY_AGE_MS;
  });

  entries.sort((a, b) => Date.parse(b[1].savedAt) - Date.parse(a[1].savedAt));
  return Object.fromEntries(entries.slice(0, MAX_STORED_ENTRIES));
}

export function saveStumbleContext(entry: StumbleContextEntry): void {
  const key = entry.hash.toLowerCase();
  const current = readStore();
  current[key] = entry;
  writeStore(pruneStore(current));
}

export function getStumbleContext(hash: `0x${string}`): StumbleContextEntry | null {
  const current = pruneStore(readStore());
  writeStore(current);
  return current[hash.toLowerCase()] ?? null;
}
