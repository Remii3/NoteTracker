import { useCallback, useEffect, useRef, useState } from "react";
import type { NoteContent, Topic } from "../model/types";

type Draft = { content: NoteContent; base: NoteContent };
type Drafts = Record<string, Draft>;

function readDrafts(key?: string): Drafts {
  if (!key) return {};
  try {
    const value: unknown = JSON.parse(
      window.sessionStorage.getItem(key) ?? "{}",
    );
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
  } catch {
    return {};
  }
}

function storageKey(scope?: string) {
  return scope ? `notetracker:drafts:v2:${scope}` : undefined;
}

export function useNoteDrafts(scope?: string) {
  const [key] = useState(() => storageKey(scope));
  const [initial] = useState(() => readDrafts(key));
  const drafts = useRef<Drafts>(initial);
  const [dirtyTopicIds, setDirtyTopicIds] = useState(
    () => new Set(Object.keys(initial)),
  );
  const [storageError, setStorageError] = useState<string | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(() => {
    if (!scope) return;
    try {
      if (!key) throw new Error("Storage unavailable");
      if (Object.keys(drafts.current).length)
        window.sessionStorage.setItem(key, JSON.stringify(drafts.current));
      else window.sessionStorage.removeItem(key);
      setStorageError(null);
    } catch {
      setStorageError(
        "Nie udało się zachować szkicu na tym urządzeniu. Zapisz notatkę przed zamknięciem strony.",
      );
    }
  }, [key, scope]);
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
    (topic: Topic, content: NoteContent) => {
      drafts.current[topic.id] = {
        content,
        base: drafts.current[topic.id]?.base ?? topic.content,
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

  return {
    acknowledgeSave,
    clearDraft,
    clearAllDrafts,
    getContent,
    getBaseContent,
    flushDrafts,
    reconcileDraft,
    storageError,
    hasDirtyDrafts: dirtyTopicIds.size > 0,
    isTopicDirty: (topicId: string) => dirtyTopicIds.has(topicId),
    updateDraft,
  };
}
