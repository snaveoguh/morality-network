// In-memory stand-in for the slice of @upstash/redis the newsletter uses
// (sets, one sorted set, counters). State is shared by every instance, as it
// would be on a real server:
//
//   vi.mock("@upstash/redis", async () => {
//     const { FakeRedis } = await import("./stubs/fake-redis");
//     return { Redis: FakeRedis };
//   });

export const fakeRedis = {
  sets: new Map<string, Set<string>>(),
  sortedSets: new Map<string, Map<string, number>>(),
  counters: new Map<string, number>(),
  /** Seconds-to-live given to each key by EXPIRE. */
  expiries: new Map<string, number>(),
  /** When true every command rejects, as if Redis were unreachable. */
  down: false,
  /** Commands on these keys reject; everything else works. */
  failingKeys: new Set<string>(),
  /** Every command issued since the last reset, e.g. "sismember newsletter:subscribers". */
  log: [] as string[],

  /** Number of commands issued since the last reset. */
  get commands(): number {
    return this.log.length;
  },

  reset(): void {
    this.sets.clear();
    this.sortedSets.clear();
    this.counters.clear();
    this.expiries.clear();
    this.failingKeys.clear();
    this.down = false;
    this.log = [];
  },

  /** Seed (or read) a plain set. */
  set(key: string): Set<string> {
    let set = this.sets.get(key);
    if (!set) {
      set = new Set();
      this.sets.set(key, set);
    }
    return set;
  },

  /** Seed (or read) a sorted set as member → score. */
  sortedSet(key: string): Map<string, number> {
    let sortedSet = this.sortedSets.get(key);
    if (!sortedSet) {
      sortedSet = new Map();
      this.sortedSets.set(key, sortedSet);
    }
    return sortedSet;
  },
};

function command(name: string, key: string): void {
  fakeRedis.log.push(`${name} ${key}`);
  if (fakeRedis.down || fakeRedis.failingKeys.has(key)) {
    // Shaped like a real Upstash error, which echoes the command it failed on.
    throw new Error(`fake redis: connection refused, command was: ["${name}","${key}"]`);
  }
}

export class FakeRedis {
  async sadd(key: string, ...members: string[]): Promise<number> {
    command("sadd", key);
    const set = fakeRedis.set(key);
    let added = 0;
    for (const member of members) {
      if (!set.has(member)) added += 1;
      set.add(member);
    }
    return added;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    command("srem", key);
    const set = fakeRedis.set(key);
    return members.filter((member) => set.delete(member)).length;
  }

  async sismember(key: string, member: string): Promise<0 | 1> {
    command("sismember", key);
    return fakeRedis.set(key).has(member) ? 1 : 0;
  }

  async smembers(key: string): Promise<string[]> {
    command("smembers", key);
    return [...fakeRedis.set(key)];
  }

  async scard(key: string): Promise<number> {
    command("scard", key);
    return fakeRedis.set(key).size;
  }

  async zadd(key: string, entry: { score: number; member: string }): Promise<number> {
    command("zadd", key);
    const sortedSet = fakeRedis.sortedSet(key);
    const added = sortedSet.has(entry.member) ? 0 : 1;
    sortedSet.set(entry.member, entry.score);
    return added;
  }

  async zscore(key: string, member: string): Promise<number | null> {
    command("zscore", key);
    return fakeRedis.sortedSet(key).get(member) ?? null;
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    command("zrem", key);
    const sortedSet = fakeRedis.sortedSet(key);
    return members.filter((member) => sortedSet.delete(member)).length;
  }

  async zremrangebyscore(key: string, min: number, max: number): Promise<number> {
    command("zremrangebyscore", key);
    const sortedSet = fakeRedis.sortedSet(key);
    let removed = 0;
    for (const [member, score] of sortedSet) {
      if (score >= min && score <= max) {
        sortedSet.delete(member);
        removed += 1;
      }
    }
    return removed;
  }

  async incr(key: string): Promise<number> {
    command("incr", key);
    const next = (fakeRedis.counters.get(key) ?? 0) + 1;
    fakeRedis.counters.set(key, next);
    return next;
  }

  async decr(key: string): Promise<number> {
    command("decr", key);
    const next = (fakeRedis.counters.get(key) ?? 0) - 1;
    fakeRedis.counters.set(key, next);
    return next;
  }

  async expire(key: string, seconds: number): Promise<0 | 1> {
    command("expire", key);
    fakeRedis.expiries.set(key, seconds);
    return 1;
  }
}
