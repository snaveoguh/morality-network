"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadTtlValue = loadTtlValue;
async function loadTtlValue(cache, key, ttlMs, loader) {
    const now = Date.now();
    const existing = cache.get(key);
    if (existing?.value !== undefined && existing.expiresAt > now) {
        return existing.value;
    }
    if (existing?.inFlight) {
        return existing.inFlight;
    }
    const nextEntry = {
        expiresAt: now + ttlMs,
    };
    const inFlight = loader()
        .then((value) => {
        cache.set(key, {
            value,
            expiresAt: Date.now() + ttlMs,
        });
        return value;
    })
        .catch((error) => {
        const stale = cache.get(key);
        if (stale?.value !== undefined) {
            return stale.value;
        }
        cache.delete(key);
        throw error;
    });
    nextEntry.inFlight = inFlight;
    cache.set(key, nextEntry);
    return inFlight;
}
