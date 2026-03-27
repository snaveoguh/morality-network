/**
 * pooter1 memory — voice profile + engagement tracking via Upstash Redis.
 * Falls back to in-memory if Redis is unavailable.
 */
import {
  UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN,
  DEFAULT_VOICE_PROFILE,
} from "./config.js";

const VOICE_KEY = "pooter1:voice-profile";
const ENGAGEMENT_KEY = "pooter1:engagement";
const FEEDBACK_KEY = "pooter1:feedback";
const DAILY_STATS_KEY = "pooter1:daily-stats";

type VoiceProfile = typeof DEFAULT_VOICE_PROFILE;

// ── Redis helpers ───────────────────────────────────────────────────

async function redisGet(key: string): Promise<string | null> {
  if (!UPSTASH_REDIS_REST_URL) return null;
  try {
    const res = await fetch(`${UPSTASH_REDIS_REST_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return data.result || null;
  } catch {
    return null;
  }
}

export async function redisSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  if (!UPSTASH_REDIS_REST_URL) return;
  try {
    const cmd = ttlSeconds
      ? `${UPSTASH_REDIS_REST_URL}/set/${key}/${encodeURIComponent(value)}/EX/${ttlSeconds}`
      : `${UPSTASH_REDIS_REST_URL}/set/${key}/${encodeURIComponent(value)}`;
    await fetch(cmd, {
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Silent fail — memory is best-effort
  }
}

async function redisLpush(key: string, value: string): Promise<void> {
  if (!UPSTASH_REDIS_REST_URL) return;
  try {
    await fetch(`${UPSTASH_REDIS_REST_URL}/lpush/${key}/${encodeURIComponent(value)}`, {
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
      signal: AbortSignal.timeout(5000),
    });
    // Trim to last 100 entries
    await fetch(`${UPSTASH_REDIS_REST_URL}/ltrim/${key}/0/99`, {
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Silent fail
  }
}

async function redisLrange(key: string, start: number, stop: number): Promise<string[]> {
  if (!UPSTASH_REDIS_REST_URL) return [];
  try {
    const res = await fetch(`${UPSTASH_REDIS_REST_URL}/lrange/${key}/${start}/${stop}`, {
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return data.result || [];
  } catch {
    return [];
  }
}

// ── Voice Profile ───────────────────────────────────────────────────

export async function getVoiceProfile(): Promise<VoiceProfile> {
  const stored = await redisGet(VOICE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return DEFAULT_VOICE_PROFILE;
    }
  }
  return DEFAULT_VOICE_PROFILE;
}

export async function saveVoiceProfile(profile: VoiceProfile): Promise<void> {
  await redisSet(VOICE_KEY, JSON.stringify(profile));
}

// ── Engagement Tracking ─────────────────────────────────────────────

interface EngagementRecord {
  entityHash: string;
  title: string;
  type: "editorial" | "comment" | "rating";
  score?: number;
  tips?: number;
  commentCount?: number;
  timestamp: string;
}

export async function recordEngagement(record: EngagementRecord): Promise<void> {
  await redisLpush(ENGAGEMENT_KEY, JSON.stringify(record));
}

export async function getRecentEngagement(count = 20): Promise<EngagementRecord[]> {
  const raw = await redisLrange(ENGAGEMENT_KEY, 0, count - 1);
  return raw.map((r) => {
    try { return JSON.parse(r); } catch { return null; }
  }).filter(Boolean);
}

// ── Feedback Collection ─────────────────────────────────────────────

interface FeedbackRecord {
  from: string; // address
  content: string;
  entityHash: string;
  sentiment: "positive" | "negative" | "neutral";
  timestamp: string;
}

export async function recordFeedback(record: FeedbackRecord): Promise<void> {
  await redisLpush(FEEDBACK_KEY, JSON.stringify(record));
}

export async function getRecentFeedback(count = 50): Promise<FeedbackRecord[]> {
  const raw = await redisLrange(FEEDBACK_KEY, 0, count - 1);
  return raw.map((r) => {
    try { return JSON.parse(r); } catch { return null; }
  }).filter(Boolean);
}

// ── Daily Rate Limit Tracking ───────────────────────────────────────

interface DailyStats {
  date: string;
  editorials: number;
  comments: number;
  ratings: number;
}

export async function getDailyStats(): Promise<DailyStats> {
  const today = new Date().toISOString().slice(0, 10);
  const stored = await redisGet(`${DAILY_STATS_KEY}:${today}`);
  if (stored) {
    try { return JSON.parse(stored); } catch {}
  }
  return { date: today, editorials: 0, comments: 0, ratings: 0 };
}

export async function incrementDailyStat(
  type: "editorials" | "comments" | "ratings",
): Promise<void> {
  const stats = await getDailyStats();
  stats[type]++;
  // TTL 48h — auto-cleanup
  await redisSet(`${DAILY_STATS_KEY}:${stats.date}`, JSON.stringify(stats), 172800);
}
