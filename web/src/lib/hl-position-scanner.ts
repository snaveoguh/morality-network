import "server-only";

import { parseClearinghouseState, type HlPosition } from "@/lib/hl-positions";

/**
 * Finds Hyperliquid accounts and polls their open positions, so the
 * liquidation map can plot real liquidation prices (see `hl-positions.ts`).
 *
 * Accounts come from three free, keyless sources (all checked live on
 * 2026-10-30):
 * - the WebSocket `trades` feed (`wss://api.hyperliquid.xyz/ws`), which names
 *   both users of every fill, listened to for WS_LISTEN_MS each cycle. Falls
 *   back to REST `recentTrades` where the runtime has no WebSocket;
 * - the stats leaderboard (`stats-data.hyperliquid.xyz/Mainnet/leaderboard`,
 *   ~40 MB, ~48k accounts), ranked by account value and by 30-day volume;
 * - the vault list (`stats-data.hyperliquid.xyz/Mainnet/vaults`, ~14 MB):
 *   open vaults over VAULT_MIN_TVL. Vaults trade from their own address.
 *   Vault depositors hold no positions themselves, so they are not polled.
 * The two stats files are streamed and only the top addresses kept.
 *
 * Rate limit (docs, "Rate limits and user limits"): 1200 weight per minute
 * per IP; `clearinghouseState` weighs 2, `recentTrades` 20 plus 1 per 20
 * trades returned. The scan spends at most SCAN_WEIGHT_PER_MIN (40% of the
 * limit), leaving room for the rest of the site and for the trader if it
 * comes back on. One call per (account, dex): stock perps live on the `xyz`
 * dex and need `dex: "xyz"`.
 *
 * Each cycle (every CYCLE_MS): re-poll accounts that hold positions, largest
 * first; then poll new accounts seen trading; then work down the
 * leaderboard. Accounts found empty are rechecked after EMPTY_RECHECK_MS.
 * Positions older than POSITION_MAX_AGE_MS are not used. The loop stops
 * after IDLE_STOP_MS without a page request and restarts on the next one.
 * No LLM calls, no keys, nothing stored outside memory.
 */

const HL_INFO = "https://api.hyperliquid.xyz/info";
const HL_WS = "wss://api.hyperliquid.xyz/ws";
const LEADERBOARD_URL = "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard";
const VAULTS_URL = "https://stats-data.hyperliquid.xyz/Mainnet/vaults";

export const SCAN_WEIGHT_PER_MIN = 480;
const STATE_WEIGHT = 2;
const RECENT_TRADES_WEIGHT = 21;
const CYCLE_MS = 5 * 60_000;
const WS_LISTEN_MS = 20_000;
const CONCURRENCY = 4;
export const POSITION_MAX_AGE_MS = 20 * 60_000;
const EMPTY_RECHECK_MS = 3 * 3_600_000;
const DIRECTORY_REFRESH_MS = 6 * 3_600_000;
const IDLE_STOP_MS = 30 * 60_000;
/** Top accounts kept from each leaderboard ranking. */
const LEADERBOARD_TOP = 4_000;
const VAULT_MIN_TVL = 100_000;
/** Share of each cycle's calls given to the `xyz` (stocks) dex at most. */
const XYZ_SHARE = 0.3;
const MAX_ACCOUNTS = 60_000;
const MAX_TRADE_USERS = 5_000;

type Dex = "" | "xyz";

interface AccountState {
  fetchedAt: number;
  positions: HlPosition[];
  /** Σ |size| × entry, for ordering re-polls. */
  notional: number;
}

interface ScanState {
  running: boolean;
  lastRequestAt: number;
  coins: string[];
  directory: { main: string[]; xyz: string[]; fetchedAt: number };
  tradeUsers: Record<"main" | "xyz", Map<string, number>>;
  accounts: Map<string, AccountState>;
  lastCycle: { startedAt: number; finishedAt: number; calls: number; errors: number } | null;
}

declare global {
  var __hlPositionScan: ScanState | undefined;
}

function state(): ScanState {
  globalThis.__hlPositionScan ??= {
    running: false,
    lastRequestAt: 0,
    coins: [],
    directory: { main: [], xyz: [], fetchedAt: 0 },
    tradeUsers: { main: new Map(), xyz: new Map() },
    accounts: new Map(),
    lastCycle: null,
  };
  return globalThis.__hlPositionScan;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms).unref?.());
const dexKey = (dex: Dex) => (dex === "xyz" ? "xyz" : "main");
const accountKey = (dex: Dex, user: string) => `${dexKey(dex)}|${user}`;

/**
 * Keep the scan running while the page is being read. Safe to call on every
 * request; does nothing during `next build`.
 */
export function touchHlScanner(coins: readonly string[]): void {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.HL_POSITION_SCAN === "off") return;
  const s = state();
  s.lastRequestAt = Date.now();
  s.coins = [...coins];
  if (s.running) return;
  s.running = true;
  void loop().finally(() => {
    s.running = false;
  });
}

export interface ScannedPositions {
  positions: HlPosition[];
  /** Accounts polled within POSITION_MAX_AGE_MS, with or without positions. */
  accountsPolled: number;
  lastCycle: ScanState["lastCycle"];
}

/** When the last scan cycle finished, or null before the first one ends. */
export function lastScanFinishedAt(): number | null {
  return globalThis.__hlPositionScan?.lastCycle?.finishedAt ?? null;
}

/** Positions polled within POSITION_MAX_AGE_MS, or null before the first cycle ends. */
export function getScannedPositions(now = Date.now()): ScannedPositions | null {
  const s = globalThis.__hlPositionScan;
  if (!s?.lastCycle) return null;
  const positions: HlPosition[] = [];
  let accountsPolled = 0;
  for (const a of s.accounts.values()) {
    if (now - a.fetchedAt > POSITION_MAX_AGE_MS) continue;
    accountsPolled++;
    for (const p of a.positions) positions.push(p);
  }
  return { positions, accountsPolled, lastCycle: s.lastCycle };
}

async function loop(): Promise<void> {
  const s = state();
  while (Date.now() - s.lastRequestAt < IDLE_STOP_MS) {
    const started = Date.now();
    try {
      await cycle(s);
    } catch (err) {
      console.warn("[hl-scan] cycle failed:", err instanceof Error ? err.message : err);
    }
    await sleep(Math.max(10_000, CYCLE_MS - (Date.now() - started)));
  }
}

async function cycle(s: ScanState): Promise<void> {
  const startedAt = Date.now();
  if (startedAt - s.directory.fetchedAt > DIRECTORY_REFRESH_MS) {
    try {
      s.directory = { ...(await loadDirectory()), fetchedAt: startedAt };
      console.info(`[hl-scan] directory: ${s.directory.main.length} accounts`);
    } catch (err) {
      console.warn("[hl-scan] directory failed:", err instanceof Error ? err.message : err);
      // Retry next cycle, but don't block this one.
    }
  }

  let budget = Math.floor(((CYCLE_MS / 60_000) * SCAN_WEIGHT_PER_MIN) / STATE_WEIGHT);
  budget -= await collectTradeUsers(s);

  const now = Date.now();
  const xyzJobs = planJobs(s, "xyz", now, Math.floor(budget * XYZ_SHARE));
  const mainJobs = planJobs(s, "", now, budget - xyzJobs.length);
  const jobs = [...mainJobs, ...xyzJobs];

  let calls = 0;
  let errors = 0;
  const spacing = (60_000 / SCAN_WEIGHT_PER_MIN) * STATE_WEIGHT;
  let nextAt = Date.now();
  let i = 0;
  let pausedUntil = 0;
  const worker = async () => {
    while (i < jobs.length) {
      const job = jobs[i++];
      const wait = Math.max(nextAt, pausedUntil) - Date.now();
      nextAt = Math.max(nextAt, pausedUntil, Date.now()) + spacing;
      if (wait > 0) await sleep(wait);
      calls++;
      try {
        const raw = await hlInfo(
          job.dex ? { type: "clearinghouseState", user: job.user, dex: job.dex } : { type: "clearinghouseState", user: job.user },
        );
        const positions = parseClearinghouseState(job.user, raw);
        const mapped = new Set(s.coins);
        s.accounts.set(accountKey(job.dex, job.user), {
          fetchedAt: Date.now(),
          positions,
          // Only coins on the map count towards re-poll priority.
          notional: positions.reduce(
            (t, p) => t + (mapped.has(p.coin) ? Math.abs(p.szi) * p.entryPx : 0),
            0,
          ),
        });
      } catch (err) {
        errors++;
        if (err instanceof RateLimited) pausedUntil = Date.now() + 30_000;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  prune(s);
  s.lastCycle = { startedAt, finishedAt: Date.now(), calls, errors };
  let holders = 0;
  for (const acc of s.accounts.values()) if (acc.notional > 0) holders++;
  console.info(
    `[hl-scan] ${calls} calls, ${errors} errors, ${holders} accounts holding mapped coins, ` +
      `${s.directory.main.length} in directory, ${s.tradeUsers.main.size + s.tradeUsers.xyz.size} from trades, ` +
      `${Math.round((Date.now() - startedAt) / 1000)}s`,
  );
}

/**
 * Accounts to poll this cycle for one dex, at most `quota`. Holders are
 * re-polled largest first, but a quarter of the quota is kept for accounts
 * not polled yet, so coverage keeps growing. Holders skipped this cycle stay
 * usable until POSITION_MAX_AGE_MS.
 */
function planJobs(s: ScanState, dex: Dex, now: number, quota: number): Array<{ user: string; dex: Dex }> {
  const key = dexKey(dex);
  const holders: Array<[string, number, number]> = [];
  for (const [k, a] of s.accounts) {
    if (!k.startsWith(`${key}|`) || a.notional <= 0) continue;
    holders.push([k.slice(key.length + 1), a.notional, a.fetchedAt]);
  }
  // Largest first; among equals, the stalest.
  holders.sort((a, b) => b[1] - a[1] || a[2] - b[2]);

  const due = (user: string) => {
    const a = s.accounts.get(accountKey(dex, user));
    return !a || (a.notional <= 0 && now - a.fetchedAt > EMPTY_RECHECK_MS);
  };
  const fresh: string[] = [];
  const seen = new Set<string>();
  const traders = [...s.tradeUsers[key].entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u);
  for (const user of [...traders, ...s.directory[key]]) {
    if (fresh.length >= quota) break;
    if (seen.has(user) || !due(user)) continue;
    seen.add(user);
    fresh.push(user);
  }

  const holderQuota = Math.max(quota - fresh.length, Math.ceil(quota * 0.75));
  const users = [
    ...holders.slice(0, holderQuota).map(([u]) => u),
    ...fresh,
    ...holders.slice(holderQuota).map(([u]) => u),
  ].slice(0, quota);
  return users.map((user) => ({ user, dex }));
}

function prune(s: ScanState): void {
  for (const m of [s.tradeUsers.main, s.tradeUsers.xyz]) {
    if (m.size <= MAX_TRADE_USERS) continue;
    const keep = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_TRADE_USERS);
    m.clear();
    for (const [u, t] of keep) m.set(u, t);
  }
  if (s.accounts.size <= MAX_ACCOUNTS) return;
  // Drop the longest-unchecked empty accounts first.
  const empties = [...s.accounts.entries()]
    .filter(([, a]) => a.notional <= 0)
    .sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
  for (const [k] of empties.slice(0, s.accounts.size - MAX_ACCOUNTS)) s.accounts.delete(k);
}

// ── Sources ─────────────────────────────────────────────────────────────

class RateLimited extends Error {}

async function hlInfo(body: unknown): Promise<unknown> {
  const res = await fetch(HL_INFO, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 429) throw new RateLimited("Hyperliquid 429");
  if (!res.ok) throw new Error(`Hyperliquid info ${res.status}`);
  return res.json();
}

/** Adds trade participants to s.tradeUsers. Returns REST calls (in clearinghouseState units) spent. */
async function collectTradeUsers(s: ScanState): Promise<number> {
  const add = (coin: string, user: string, t: number) => {
    const m = s.tradeUsers[coin.startsWith("xyz:") ? "xyz" : "main"];
    m.set(user.toLowerCase(), t);
  };
  const WS = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
  if (WS) {
    const ok = await new Promise<boolean>((resolve) => {
      let opened = false;
      let ws: WebSocket;
      try {
        ws = new WS(HL_WS);
      } catch {
        resolve(false);
        return;
      }
      const done = () => {
        try {
          ws.close();
        } catch {
          /* already closed */
        }
        resolve(opened);
      };
      const timer = setTimeout(done, WS_LISTEN_MS);
      timer.unref?.();
      ws.onopen = () => {
        opened = true;
        for (const coin of s.coins) {
          ws.send(JSON.stringify({ method: "subscribe", subscription: { type: "trades", coin } }));
        }
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as {
            channel?: string;
            data?: Array<{ coin: string; time: number; users?: string[] }>;
          };
          if (msg.channel !== "trades" || !Array.isArray(msg.data)) return;
          for (const t of msg.data) for (const u of t.users ?? []) add(t.coin, u, t.time);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onerror = () => {
        clearTimeout(timer);
        done();
      };
    });
    if (ok) return 0;
  }
  // REST fallback: the last few trades per coin.
  let spent = 0;
  for (const coin of s.coins) {
    try {
      const trades = (await hlInfo({ type: "recentTrades", coin })) as Array<{
        coin: string;
        time: number;
        users?: string[];
      }>;
      for (const t of trades) for (const u of t.users ?? []) add(t.coin, u, t.time);
    } catch {
      /* skip this coin */
    }
    spent += Math.ceil(RECENT_TRADES_WEIGHT / STATE_WEIGHT);
    await sleep(((60_000 / SCAN_WEIGHT_PER_MIN) * RECENT_TRADES_WEIGHT) | 0);
  }
  return spent;
}

async function loadDirectory(): Promise<{ main: string[]; xyz: string[] }> {
  const [board, vaults] = await Promise.all([
    streamLeaderboard().catch(() => ({ byValue: [], byVolume: [] })),
    streamVaults().catch(() => []),
  ]);
  // Vaults first, then the two rankings interleaved.
  const order: string[] = [...vaults];
  for (let i = 0; i < Math.max(board.byValue.length, board.byVolume.length); i++) {
    if (board.byValue[i]) order.push(board.byValue[i]);
    if (board.byVolume[i]) order.push(board.byVolume[i]);
  }
  const main = [...new Set(order)];
  if (!main.length) throw new Error("no accounts from leaderboard or vaults");
  // Stocks are a smaller market: poll the top of the same list.
  return { main, xyz: main.slice(0, Math.ceil(main.length / 4)) };
}

/**
 * Splits a streamed JSON array into one text segment per row, cut at each
 * occurrence of `marker`, without parsing the whole document.
 */
async function streamSegments(url: string, marker: string, onSegment: (seg: string) => void): Promise<void> {
  // no-store: keeps Next's fetch cache from buffering a 40 MB body.
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(120_000) });
  if (!res.ok || !res.body) throw new Error(`${url} ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let cut = buf.lastIndexOf(marker);
    if (done) cut = buf.length;
    if (cut > 0) {
      const head = buf.slice(0, cut);
      buf = buf.slice(cut);
      for (const seg of head.split(marker)) if (seg) onSegment(marker + seg);
    }
    if (done) break;
  }
}

/** Keeps the top `n` items by score without holding the full list. */
class TopN {
  private items: Array<[string, number]> = [];
  constructor(private n: number) {}
  add(id: string, score: number) {
    if (!(score > 0)) return;
    this.items.push([id, score]);
    if (this.items.length > this.n * 2) this.trim();
  }
  private trim() {
    this.items.sort((a, b) => b[1] - a[1]);
    this.items.length = Math.min(this.items.length, this.n);
  }
  ids(): string[] {
    this.trim();
    return this.items.map(([id]) => id);
  }
}

const ADDR = /"ethAddress":\s*"(0x[0-9a-fA-F]{40})"/;
const ACCOUNT_VALUE = /"accountValue":\s*"(-?[\d.]+)"/;
const MONTH_VLM = /"month",\s*\{[^}]*?"vlm":\s*"([\d.]+)"/;

export function parseLeaderboardSegment(seg: string): { user: string; value: number; volume: number } | null {
  const a = ADDR.exec(seg);
  if (!a) return null;
  return {
    user: a[1].toLowerCase(),
    value: Number(ACCOUNT_VALUE.exec(seg)?.[1] ?? 0),
    volume: Number(MONTH_VLM.exec(seg)?.[1] ?? 0),
  };
}

async function streamLeaderboard(): Promise<{ byValue: string[]; byVolume: string[] }> {
  const byValue = new TopN(LEADERBOARD_TOP);
  const byVolume = new TopN(LEADERBOARD_TOP);
  await streamSegments(LEADERBOARD_URL, '"ethAddress"', (seg) => {
    const row = parseLeaderboardSegment(seg);
    if (!row) return;
    byValue.add(row.user, row.value);
    byVolume.add(row.user, row.volume);
  });
  return { byValue: byValue.ids(), byVolume: byVolume.ids() };
}

const VAULT_ADDR = /"vaultAddress":\s*"(0x[0-9a-fA-F]{40})"/;
const VAULT_TVL = /"tvl":\s*"([\d.]+)"/;
const VAULT_CLOSED = /"isClosed":\s*true/;

export function parseVaultSegment(seg: string): { vault: string; tvl: number; closed: boolean } | null {
  const a = VAULT_ADDR.exec(seg);
  if (!a) return null;
  return {
    vault: a[1].toLowerCase(),
    tvl: Number(VAULT_TVL.exec(seg)?.[1] ?? 0),
    closed: VAULT_CLOSED.test(seg),
  };
}

async function streamVaults(): Promise<string[]> {
  const top = new TopN(500);
  await streamSegments(VAULTS_URL, '"vaultAddress"', (seg) => {
    const v = parseVaultSegment(seg);
    if (v && !v.closed && v.tvl >= VAULT_MIN_TVL) top.add(v.vault, v.tvl);
  });
  return top.ids();
}
