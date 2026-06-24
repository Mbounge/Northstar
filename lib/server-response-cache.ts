// lib/server-response-cache.ts

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  createdAt: number;
  lastAccessedAt: number;
};

type CacheResult<T> = {
  value: T;
  status: "HIT" | "MISS";
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 250;

const memoryCache = new Map<string, CacheEntry<unknown>>();

function pruneCache(maxEntries = DEFAULT_MAX_ENTRIES) {
  const now = Date.now();

  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt <= now) {
      memoryCache.delete(key);
    }
  }

  if (memoryCache.size <= maxEntries) return;

  const sortedEntries = Array.from(memoryCache.entries()).sort(
    (a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt
  );

  const entriesToDelete = sortedEntries.slice(0, memoryCache.size - maxEntries);

  for (const [key] of entriesToDelete) {
    memoryCache.delete(key);
  }
}

export async function getOrSetServerResponseCache<T>(
  key: string,
  loader: () => Promise<T>,
  options?: {
    ttlMs?: number;
    maxEntries?: number;
  }
): Promise<CacheResult<T>> {
  const now = Date.now();
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;

  const existing = memoryCache.get(key) as CacheEntry<T> | undefined;

  if (existing && existing.expiresAt > now) {
    existing.lastAccessedAt = now;

    return {
      value: existing.value,
      status: "HIT",
    };
  }

  const value = await loader();

  memoryCache.set(key, {
    value,
    createdAt: now,
    lastAccessedAt: now,
    expiresAt: now + ttlMs,
  });

  pruneCache(maxEntries);

  return {
    value,
    status: "MISS",
  };
}

export function privateApiCacheHeaders(cacheStatus: "HIT" | "MISS"): HeadersInit {
  return {
    "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
    "Vary": "Cookie",
    "X-Northstar-Cache": cacheStatus,
  };
}