const entries = new Map<string, unknown>();

export function readMemoryCache<T>(key: string): T | undefined {
  return entries.get(key) as T | undefined;
}

export function writeMemoryCache<T>(key: string, value: T) {
  entries.set(key, value);
}

export function clearMemoryCacheByPrefix(prefix: string) {
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
}

export function clearUserMemoryCache(userId: string) {
  clearMemoryCacheByPrefix(`modules:${userId}`);
  clearMemoryCacheByPrefix(`notes:${userId}:`);
  clearMemoryCacheByPrefix(`statistics:${userId}:`);
}
