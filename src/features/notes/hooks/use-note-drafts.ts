import { useCallback, useEffect, useRef, useState } from "react";
import type { NoteContent, Topic } from "../types/model";
import {
  readDrafts,
  removeDrafts,
  supportsDraftStorage,
  writeDrafts,
} from "@/lib/draft-storage";

type Draft = {
  content: NoteContent;
  base: NoteContent;
  chapterId?: string;
};
type Drafts = Record<string, Draft>;

function normalizeDrafts(value: unknown): Drafts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, entry]) =>
        entry &&
        typeof entry === "object" &&
        entry.content?.type === "doc" &&
        entry.base?.type === "doc",
    ),
  );
}

function readLegacyDrafts(key?: string): Drafts {
  if (!key) return {};
  try {
    return normalizeDrafts(
      JSON.parse(window.sessionStorage.getItem(key) ?? "{}") as unknown,
    );
  } catch {
    return {};
  }
}

function storageKey(scope?: string) {
  return scope ? `notetracker:drafts:v3:${scope}` : undefined;
}

function legacyStorageKey(scope?: string) {
  return scope ? `notetracker:drafts:v2:${scope}` : undefined;
}

export function useNoteDrafts(scope?: string) {
  const [key] = useState(() => storageKey(scope));
  const [legacyKey] = useState(() => legacyStorageKey(scope));
  const [initial] = useState(() => readLegacyDrafts(legacyKey));
  const drafts = useRef<Drafts>(initial);
  const persistQueue = useRef(Promise.resolve());
  const [dirtyTopicIds, setDirtyTopicIds] = useState(
    () => new Set(Object.keys(initial)),
  );
  const [storageError, setStorageError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(() => !key || !supportsDraftStorage());
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(() => {
    if (!scope) return;
    if (!key) return;
    const snapshot = structuredClone(drafts.current);
    let fallbackSaved = true;
    try {
      if (Object.keys(snapshot).length)
        window.sessionStorage.setItem(
          legacyKey ?? key,
          JSON.stringify(snapshot),
        );
      else window.sessionStorage.removeItem(legacyKey ?? key);
    } catch {
      fallbackSaved = false;
    }
    if (!supportsDraftStorage()) {
      setStorageError(
        fallbackSaved
          ? null
          : "Nie udało się zachować szkicu na tym urządzeniu. Zapisz notatkę przed zamknięciem strony.",
      );
      return;
    }
    persistQueue.current = persistQueue.current
      .catch(() => undefined)
      .then(() =>
        Object.keys(snapshot).length
          ? writeDrafts(key, snapshot)
          : removeDrafts(key),
      );
    void persistQueue.current.then(
      () => {
        if (legacyKey) window.sessionStorage.removeItem(legacyKey);
        setStorageError(null);
      },
      () => {
        setStorageError(
          "Nie udało się zachować szkicu na tym urządzeniu. Zapisz notatkę przed zamknięciem strony.",
        );
      },
    );
  }, [key, legacyKey, scope]);
  const schedulePersist = useCallback(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      persistTimer.current = null;
      persist();
    }, 250);
  }, [persist]);
  const flushDrafts = useCallback(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = null;
    persist();
  }, [persist]);

  useEffect(
    () => () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persist();
    },
    [persist],
  );

  useEffect(() => {
    if (!key || !supportsDraftStorage()) return;
    let active = true;
    void readDrafts<Drafts>(key).then(
      (stored) => {
        if (!active) return;
        const recovered = normalizeDrafts(stored);
        drafts.current = { ...recovered, ...drafts.current };
        setDirtyTopicIds(new Set(Object.keys(drafts.current)));
        if (Object.keys(initial).length) persist();
        setIsReady(true);
      },
      () => {
        if (active) {
          setStorageError(
            "Nie udało się odczytać lokalnych szkiców na tym urządzeniu.",
          );
          setIsReady(true);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [initial, key, persist]);

  const clearDraft = useCallback(
    (topicId: string) => {
      delete drafts.current[topicId];
      flushDrafts();
      setDirtyTopicIds((current) => {
        const next = new Set(current);
        next.delete(topicId);
        return next;
      });
    },
    [flushDrafts],
  );

  const clearAllDrafts = useCallback(() => {
    drafts.current = {};
    flushDrafts();
    setDirtyTopicIds(new Set());
  }, [flushDrafts]);

  const updateDraft = useCallback(
    (topic: Topic, content: NoteContent, chapterId?: string) => {
      drafts.current[topic.id] = {
        content,
        base: drafts.current[topic.id]?.base ?? topic.content,
        chapterId: chapterId ?? drafts.current[topic.id]?.chapterId,
      };
      schedulePersist();
      setDirtyTopicIds((current) => {
        const next = new Set(current);
        if (JSON.stringify(content) === JSON.stringify(topic.content))
          next.delete(topic.id);
        else next.add(topic.id);
        return next;
      });
    },
    [schedulePersist],
  );
  const getContent = useCallback(
    (topic: Topic) => drafts.current[topic.id]?.content ?? topic.content,
    [],
  );
  const getBaseContent = useCallback(
    (topic: Topic) => drafts.current[topic.id]?.base ?? topic.content,
    [],
  );
  const reconcileDraft = useCallback(
    (topic: Topic) => {
      const draft = drafts.current[topic.id];
      if (
        draft &&
        JSON.stringify(draft.content) === JSON.stringify(topic.content)
      ) {
        clearDraft(topic.id);
      }
    },
    [clearDraft],
  );
  const acknowledgeSave = useCallback(
    (topicId: string, saved: NoteContent) => {
      const latest = drafts.current[topicId];
      if (!latest || JSON.stringify(latest.content) === JSON.stringify(saved)) {
        clearDraft(topicId);
        return true;
      }
      latest.base = saved;
      flushDrafts();
      setDirtyTopicIds((current) => new Set(current).add(topicId));
      return false;
    },
    [clearDraft, flushDrafts],
  );
  const getPendingDrafts = useCallback(
    () =>
      Object.entries(drafts.current).map(([topicId, draft]) => ({
        topicId,
        chapterId: draft.chapterId,
        content: structuredClone(draft.content),
        base: structuredClone(draft.base),
      })),
    [],
  );

  return {
    acknowledgeSave,
    clearDraft,
    clearAllDrafts,
    getContent,
    getBaseContent,
    getPendingDrafts,
    flushDrafts,
    reconcileDraft,
    storageError,
    hasDirtyDrafts: dirtyTopicIds.size > 0,
    pendingDraftCount: dirtyTopicIds.size,
    isReady,
    isTopicDirty: (topicId: string) => dirtyTopicIds.has(topicId),
    updateDraft,
  };
}
