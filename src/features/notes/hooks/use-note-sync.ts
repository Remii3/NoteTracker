import { useCallback, useEffect, useRef, useState } from "react";

import {
  NoteContentConflictError,
  type NotesRepository,
} from "../data/notes-repository";
import type { Chapter, NoteContent } from "../types/model";

type PendingDraft = {
  topicId: string;
  chapterId?: string;
  content: NoteContent;
  base: NoteContent;
};

export type NoteSyncConflict = {
  chapterId: string;
  topicId: string;
  topicTitle: string;
  localContent: NoteContent;
  serverContent: NoteContent;
};

type Options = {
  scope?: string;
  repository?: NotesRepository;
  chapters: Chapter[];
  draftsReady: boolean;
  isOnline: boolean;
  getPendingDrafts: () => PendingDraft[];
  acknowledgeSave: (topicId: string, saved: NoteContent) => boolean;
  clearDraft: (topicId: string) => void;
  clearStoreError: () => void;
  replaceTopicContent: (
    chapterId: string,
    topicId: string,
    content: NoteContent,
  ) => void;
  saveContent: (
    chapterId: string,
    topicId: string,
    content: NoteContent,
    expectedContent: NoteContent,
    onError?: (error: unknown) => void,
  ) => Promise<boolean>;
};

function syncStorageKey(scope?: string) {
  return scope ? `notetracker:note-sync:v1:${scope}` : undefined;
}

function readLastSyncedAt(scope?: string) {
  const key = syncStorageKey(scope);
  if (!key || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useNoteSync({
  scope,
  repository,
  chapters,
  draftsReady,
  isOnline,
  getPendingDrafts,
  acknowledgeSave,
  clearDraft,
  clearStoreError,
  replaceTopicContent,
  saveContent,
}: Options) {
  const chaptersRef = useRef(chapters);
  const syncingRef = useRef(false);
  const conflictsRef = useRef<NoteSyncConflict[]>([]);
  const [conflicts, setConflictsState] = useState<NoteSyncConflict[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() =>
    readLastSyncedAt(scope),
  );

  useEffect(() => {
    chaptersRef.current = chapters;
  }, [chapters]);

  const setConflicts = useCallback(
    (
      update:
        | NoteSyncConflict[]
        | ((current: NoteSyncConflict[]) => NoteSyncConflict[]),
    ) => {
      setConflictsState((current) => {
        const next = typeof update === "function" ? update(current) : update;
        conflictsRef.current = next;
        return next;
      });
    },
    [],
  );

  const markSynced = useCallback(() => {
    const timestamp = new Date().toISOString();
    setLastSyncedAt(timestamp);
    const key = syncStorageKey(scope);
    if (!key) return;
    try {
      window.localStorage.setItem(key, timestamp);
    } catch {
      // The status remains available for the current session.
    }
  }, [scope]);

  const findChapterId = useCallback((draft: PendingDraft) => {
    return (
      draft.chapterId ??
      chaptersRef.current.find((chapter) =>
        chapter.topics.some((topic) => topic.id === draft.topicId),
      )?.id
    );
  }, []);

  const readServerConflict = useCallback(
    async (draft: PendingDraft, chapterId: string) => {
      if (!repository) return;
      const serverContent = await repository.getFreshTopicContent(
        chapterId,
        draft.topicId,
      );
      const topicTitle =
        chaptersRef.current
          .find((chapter) => chapter.id === chapterId)
          ?.topics.find((topic) => topic.id === draft.topicId)?.title ??
        "Notatka";
      const conflict: NoteSyncConflict = {
        chapterId,
        topicId: draft.topicId,
        topicTitle,
        localContent: draft.content,
        serverContent,
      };
      setConflicts((current) => [
        ...current.filter((item) => item.topicId !== draft.topicId),
        conflict,
      ]);
      clearStoreError();
    },
    [clearStoreError, repository, setConflicts],
  );

  const handleSaveFailure = useCallback(
    async (draft: PendingDraft, caughtError: unknown) => {
      const chapterId = findChapterId(draft);
      if (caughtError instanceof NoteContentConflictError && chapterId) {
        try {
          await readServerConflict(draft, chapterId);
        } catch (freshError) {
          setError(getSyncError(freshError));
        }
        return;
      }
      if (caughtError) setError(getSyncError(caughtError));
    },
    [findChapterId, readServerConflict],
  );

  const syncDrafts = useCallback(async () => {
    if (
      syncingRef.current ||
      !repository ||
      typeof navigator === "undefined" ||
      !navigator.onLine
    )
      return;
    syncingRef.current = true;
    setIsSyncing(true);
    setError(null);
    let savedAny = false;
    try {
      for (const draft of getPendingDrafts()) {
        if (conflictsRef.current.some((item) => item.topicId === draft.topicId))
          continue;
        const chapterId = findChapterId(draft);
        if (!chapterId) continue;
        let caughtError: unknown;
        const saved = await saveContent(
          chapterId,
          draft.topicId,
          draft.content,
          draft.base,
          (caught) => {
            caughtError = caught;
          },
        );
        if (saved) {
          acknowledgeSave(draft.topicId, draft.content);
          savedAny = true;
          continue;
        }
        await handleSaveFailure(draft, caughtError);
      }
      if (savedAny) markSynced();
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [
    acknowledgeSave,
    findChapterId,
    getPendingDrafts,
    handleSaveFailure,
    markSynced,
    repository,
    saveContent,
  ]);

  useEffect(() => {
    if (!draftsReady) return;
    if (isOnline) void syncDrafts();
    const handleOnline = () => void syncDrafts();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [draftsReady, isOnline, syncDrafts]);

  const useServerVersion = useCallback(
    (conflict: NoteSyncConflict) => {
      replaceTopicContent(
        conflict.chapterId,
        conflict.topicId,
        conflict.serverContent,
      );
      clearDraft(conflict.topicId);
      setConflicts((current) =>
        current.filter((item) => item.topicId !== conflict.topicId),
      );
      clearStoreError();
      setError(null);
      markSynced();
    },
    [
      clearDraft,
      clearStoreError,
      markSynced,
      replaceTopicContent,
      setConflicts,
    ],
  );

  const keepLocalVersion = useCallback(
    async (conflict: NoteSyncConflict) => {
      if (syncingRef.current) return false;
      const latest =
        getPendingDrafts().find((draft) => draft.topicId === conflict.topicId)
          ?.content ?? conflict.localContent;
      syncingRef.current = true;
      setIsSyncing(true);
      setError(null);
      let caughtError: unknown;
      try {
        const saved = await saveContent(
          conflict.chapterId,
          conflict.topicId,
          latest,
          conflict.serverContent,
          (caught) => {
            caughtError = caught;
          },
        );
        if (saved) {
          acknowledgeSave(conflict.topicId, latest);
          setConflicts((current) =>
            current.filter((item) => item.topicId !== conflict.topicId),
          );
          clearStoreError();
          markSynced();
          return true;
        }
        if (caughtError instanceof NoteContentConflictError) {
          await readServerConflict(
            {
              topicId: conflict.topicId,
              chapterId: conflict.chapterId,
              content: latest,
              base: conflict.serverContent,
            },
            conflict.chapterId,
          );
        } else setError(getSyncError(caughtError));
        return false;
      } catch (caught) {
        setError(getSyncError(caught));
        return false;
      } finally {
        syncingRef.current = false;
        setIsSyncing(false);
      }
    },
    [
      acknowledgeSave,
      clearStoreError,
      getPendingDrafts,
      markSynced,
      readServerConflict,
      saveContent,
      setConflicts,
    ],
  );

  return {
    conflicts,
    error,
    handleSaveFailure,
    isSyncing,
    keepLocalVersion,
    lastSyncedAt,
    recordSuccessfulSync: markSynced,
    retry: syncDrafts,
    useServerVersion,
  };
}

function getSyncError(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "Nie udało się zsynchronizować lokalnych zmian.";
}
