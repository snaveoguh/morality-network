// In-memory stand-in for the slice of @upstash/redis the newsletter uses
// (sets and one sorted set). State is shared by every instance, as it would be
// on a real server:
//
//   vi.mock("@upstash/redis", async () => {
//     const { FakeRedis } = await import("./stubs/fake-redis");
//     return { Redis: FakeRedis };
//   });

export const fakeRedis = {
  sets: new Map<string, Set<string>>(),
  sortedSets: new Map<string, Map<string, number>>(),
  /** When true every command rejects, as if Redis were unreachable. */
  down: false,
  /** Commands issued since the last reset. */
  commands: 0,

  reset(): void {
    this.sets.clear();
    this.sortedSets.clear();
    this.down = false;
    this.commands = 0;
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

function command(): void {
  fakeRedis.commands += 1;
  if (fakeRedis.down) throw new Error("fake redis: connection refused");
}

export class FakeRedis {
  async sadd(key: string, ...members: string[]): Promise<number> {
    command();
    const set = fakeRedis.set(key);
    let added = 0;
    for (const member of members) {
      if (!set.has(member)) added += 1;
      set.add(member);
    }
    return added;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    command();
    const set = fakeRedis.set(key);
    return members.filter((member) => set.delete(member)).length;
  }

  async sismember(key: string, member: string): Promise<0 | 1> {
    command();
    return fakeRedis.set(key).has(member) ? 1 : 0;
  }

  async smembers(key: string): Promise<string[]> {
    command();
    return [...fakeRedis.set(key)];
  }

  async scard(key: string): Promise<number> {
    command();
    return fakeRedis.set(key).size;
  }

  async zadd(key: string, entry: { score: number; member: string }): Promise<number> {
    command();
    const sortedSet = fakeRedis.sortedSet(key);
    const added = sortedSet.has(entry.member) ? 0 : 1;
    sortedSet.set(entry.member, entry.score);
    return added;
  }

  async zscore(key: string, member: string): Promise<number | null> {
    command();
    return fakeRedis.sortedSet(key).get(member) ?? null;
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    command();
    const sortedSet = fakeRedis.sortedSet(key);
    return members.filter((member) => sortedSet.delete(member)).length;
  }

  async zremrangebyscore(key: string, min: number, max: number): Promise<number> {
    command();
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
}
