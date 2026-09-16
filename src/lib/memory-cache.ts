const entries = new Map<string, unknown>();

export type RecentModule = {
  id: string;
  slug: string;
  name: string;
  progress: number;
};

const RECENT_MODULES_EVENT = "notetracker:recent-modules-change";

function recentModulesKey(userId: string) {
  return `recent-modules:${userId}`;
}

function normalizeProgress(progress: number) {
  return Math.min(100, Math.max(0, Math.round(progress)));
}

function writeRecentModules(userId: string, modules: RecentModule[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      recentModulesKey(userId),
      JSON.stringify(modules.slice(0, 3)),
    );
    window.dispatchEvent(
      new CustomEvent(RECENT_MODULES_EVENT, { detail: userId }),
    );
  } catch {
    // Historia jest jedynie ułatwieniem nawigacji.
  }
}

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

export function clearDeletedUserLocalData(userId: string) {
  clearUserMemoryCache(userId);
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(recentModulesKey(userId));
    const draftPrefix = `notetracker:drafts:v2:${userId}:`;
    for (let index = window.sessionStorage.length - 1; index >= 0; index--) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(draftPrefix)) window.sessionStorage.removeItem(key);
    }
  } catch {
    // Dane lokalne są tylko pamięcią podręczną aplikacji.
  }
}

export function readRecentModules(userId: string): RecentModule[] {
  if (typeof window === "undefined") return [];

  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(recentModulesKey(userId)) ?? "[]",
    );
    if (!Array.isArray(value)) return [];

    return value
      .filter(
        (item): item is RecentModule =>
          typeof item === "object" &&
          item !== null &&
          typeof item.id === "string" &&
          typeof item.slug === "string" &&
          typeof item.name === "string" &&
          typeof item.progress === "number",
      )
      .map((module) => ({
        ...module,
        progress: normalizeProgress(module.progress),
      }))
      .slice(0, 3);
  } catch {
    return [];
  }
}

export function rememberRecentModule(
  userId: string,
  module: {
    id: string;
    slug: string;
    name: string;
    topicsCount: number;
    completedTopicsCount: number;
  },
) {
  if (typeof window === "undefined") return;

  const progress = module.topicsCount
    ? normalizeProgress(
        (module.completedTopicsCount / module.topicsCount) * 100,
      )
    : 0;
  const recent = readRecentModules(userId).filter(
    (item) => item.id !== module.id,
  );

  writeRecentModules(userId, [
    {
      id: module.id,
      slug: module.slug,
      name: module.name,
      progress,
    },
    ...recent,
  ]);
}

export function updateRecentModuleProgress(
  userId: string,
  moduleId: string,
  completedTopicsCount: number,
  topicsCount: number,
) {
  const recent = readRecentModules(userId);
  if (!recent.some((module) => module.id === moduleId)) return;

  const progress = topicsCount
    ? normalizeProgress((completedTopicsCount / topicsCount) * 100)
    : 0;
  if (recent.find((module) => module.id === moduleId)?.progress === progress)
    return;
  writeRecentModules(
    userId,
    recent.map((module) =>
      module.id === moduleId ? { ...module, progress } : module,
    ),
  );
}

export function forgetRecentModule(userId: string, moduleId: string) {
  const recent = readRecentModules(userId);
  const next = recent.filter((module) => module.id !== moduleId);
  if (next.length !== recent.length) writeRecentModules(userId, next);
}

export function reconcileRecentModules(
  userId: string,
  modules: Array<{
    id: string;
    slug: string;
    name: string;
    topicsCount: number;
    completedTopicsCount: number;
  }>,
) {
  const recent = readRecentModules(userId);
  const modulesById = new Map(modules.map((module) => [module.id, module]));
  const next = recent.flatMap((recentModule) => {
    const module = modulesById.get(recentModule.id);
    if (!module) return [];
    return [
      {
        id: module.id,
        slug: module.slug,
        name: module.name,
        progress: module.topicsCount
          ? normalizeProgress(
              (module.completedTopicsCount / module.topicsCount) * 100,
            )
          : 0,
      },
    ];
  });

  if (JSON.stringify(next) !== JSON.stringify(recent))
    writeRecentModules(userId, next);
}

export function subscribeToRecentModules(
  userId: string,
  onChange: (modules: RecentModule[]) => void,
) {
  if (typeof window === "undefined") return () => undefined;

  const handleChange = (event: Event) => {
    if (
      event instanceof CustomEvent &&
      event.type === RECENT_MODULES_EVENT &&
      event.detail !== userId
    )
      return;
    if (event instanceof StorageEvent && event.key !== recentModulesKey(userId))
      return;
    onChange(readRecentModules(userId));
  };

  window.addEventListener(RECENT_MODULES_EVENT, handleChange);
  window.addEventListener("storage", handleChange);
  return () => {
    window.removeEventListener(RECENT_MODULES_EVENT, handleChange);
    window.removeEventListener("storage", handleChange);
  };
}
