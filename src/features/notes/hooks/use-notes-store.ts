import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { memoryNotesRepository } from "../data/memory-notes-repository";
import type { NotesRepository } from "../data/notes-repository";
import {
  addChapterToCollection,
  addTopicsToChapter,
  deleteManagedItem,
  renameManagedItem,
  saveTopicContent,
  toggleChapterTopics,
  updateTopic,
} from "../domain/chapter-operations";
import {
  materializeChapters,
  normalizeChapters,
  type NotesState,
} from "../model/notes-state";
import type { Chapter, NoteContent, Topic } from "../model/types";
import type { ManagedItem } from "../model/workspace-types";

type Options = {
  repository?: NotesRepository;
  initialChapters?: Chapter[];
  loadOnMount?: boolean;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useNotesStore({
  repository = memoryNotesRepository,
  initialChapters = memoryNotesRepository.getSnapshot(),
  loadOnMount = false,
}: Options = {}) {
  const initialState = useMemo(
    () => normalizeChapters(initialChapters),
    [initialChapters],
  );
  const [state, setState] = useState<NotesState>(initialState);
  const stateRef = useRef(state);
  const operationLockRef = useRef(false);
  const [isLoading, setIsLoading] = useState(loadOnMount);
  const [pendingOperations, setPendingOperations] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const chapters = useMemo(() => materializeChapters(state), [state]);
  const clearError = useCallback(() => setError(null), []);

  const applyState = useCallback((next: NotesState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const applyChapters = useCallback(
    (next: Chapter[]) => applyState(normalizeChapters(next)),
    [applyState],
  );

  const runOptimistic = useCallback(
    async (
      updater: (chapters: Chapter[]) => Chapter[],
      persist: (next: Chapter[]) => Promise<void>,
      errorMessage: string,
    ) => {
      if (operationLockRef.current) return false;
      operationLockRef.current = true;
      const previous = materializeChapters(stateRef.current);
      const next = updater(previous);
      applyChapters(next);
      setError(null);
      setPendingOperations((count) => count + 1);
      try {
        await persist(next);
        return true;
      } catch (caughtError) {
        applyChapters(previous);
        setError(getErrorMessage(caughtError, errorMessage));
        return false;
      } finally {
        operationLockRef.current = false;
        setPendingOperations((count) => Math.max(0, count - 1));
      }
    },
    [applyChapters],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const summaries = await repository.listChapters();
      const loaded = await Promise.all(
        summaries.map(async (chapter) => ({
          ...chapter,
          topics: await repository.listTopics(chapter.id),
        })),
      );
      applyChapters(loaded);
      return true;
    } catch (caughtError) {
      setError(
        getErrorMessage(caughtError, "Nie udało się pobrać danych aplikacji."),
      );
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [applyChapters, repository]);

  useEffect(() => {
    if (!loadOnMount) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load, loadOnMount]);

  const previewChapters = useCallback(
    (updater: (chapters: Chapter[]) => Chapter[]) => {
      applyChapters(updater(materializeChapters(stateRef.current)));
    },
    [applyChapters],
  );

  const restoreChapters = useCallback(
    (snapshot: Chapter[]) => applyChapters(snapshot),
    [applyChapters],
  );

  const commitDrag = useCallback(
    async (
      previous: Chapter[],
      next: Chapter[],
      activeType: "chapter" | "topic",
      activeId: string,
    ) => {
      if (operationLockRef.current) return false;
      operationLockRef.current = true;
      setError(null);
      setPendingOperations((count) => count + 1);
      try {
        if (activeType === "chapter") {
          await repository.reorderChapters(next.map((chapter) => chapter.id));
        } else {
          const source = previous.find((chapter) =>
            chapter.topics.some((topic) => topic.id === activeId),
          );
          const target = next.find((chapter) =>
            chapter.topics.some((topic) => topic.id === activeId),
          );
          if (!source || !target) throw new Error("Nie znaleziono tematu.");
          if (source.id === target.id) {
            await repository.reorderTopics(
              target.id,
              target.topics.map((topic) => topic.id),
            );
          } else {
            await repository.moveTopic(
              activeId,
              source.id,
              target.id,
              target.topics.find((topic) => topic.id === activeId)?.slug ?? "",
              next
                .find((chapter) => chapter.id === source.id)
                ?.topics.map((topic) => topic.id) ?? [],
              target.topics.map((topic) => topic.id),
            );
          }
        }
        return true;
      } catch (caughtError) {
        applyChapters(previous);
        setError(
          getErrorMessage(
            caughtError,
            "Nie udało się zapisać nowej kolejności.",
          ),
        );
        return false;
      } finally {
        operationLockRef.current = false;
        setPendingOperations((count) => Math.max(0, count - 1));
      }
    },
    [applyChapters, repository],
  );

  const addChapter = useCallback(
    (chapter: Chapter) =>
      runOptimistic(
        (current) => addChapterToCollection(current, chapter),
        () => repository.createChapter(chapter),
        "Nie udało się dodać rozdziału.",
      ),
    [repository, runOptimistic],
  );
  const addTopics = useCallback(
    (chapterId: string, topics: Topic[]) =>
      runOptimistic(
        (current) => addTopicsToChapter(current, chapterId, topics),
        () => repository.createTopics(chapterId, topics),
        "Nie udało się dodać tematów.",
      ),
    [repository, runOptimistic],
  );
  const removeItem = useCallback(
    (item: ManagedItem) =>
      runOptimistic(
        (current) => deleteManagedItem(current, item),
        () =>
          item.kind === "chapter"
            ? repository.deleteChapter(item.id)
            : repository.deleteTopic(item.chapterId, item.id),
        "Nie udało się usunąć elementu.",
      ),
    [repository, runOptimistic],
  );
  const renameItem = useCallback(
    (item: ManagedItem, title: string) =>
      runOptimistic(
        (current) => renameManagedItem(current, item, title),
        () =>
          item.kind === "chapter"
            ? repository.updateChapter(item.id, { title })
            : repository.updateTopic(item.chapterId, item.id, { title }),
        "Nie udało się zmienić nazwy.",
      ),
    [repository, runOptimistic],
  );
  const saveContent = useCallback(
    (chapterId: string, topicId: string, content: NoteContent) =>
      runOptimistic(
        (current) => saveTopicContent(current, chapterId, topicId, content),
        () => repository.updateTopicContent(chapterId, topicId, content),
        "Nie udało się zapisać notatki.",
      ),
    [repository, runOptimistic],
  );
  const toggleChapter = useCallback(
    (chapterId: string, completed: boolean) =>
      runOptimistic(
        (current) => toggleChapterTopics(current, chapterId, completed),
        () => repository.setChapterCompleted(chapterId, completed),
        "Nie udało się zmienić statusu rozdziału.",
      ),
    [repository, runOptimistic],
  );
  const toggleTopic = useCallback(
    (chapterId: string, topicId: string, completed: boolean) =>
      runOptimistic(
        (current) =>
          updateTopic(current, chapterId, topicId, (topic) => ({
            ...topic,
            completed,
          })),
        () => repository.updateTopic(chapterId, topicId, { completed }),
        "Nie udało się zmienić statusu tematu.",
      ),
    [repository, runOptimistic],
  );

  return {
    addChapter,
    addTopics,
    chapters,
    clearError,
    commitDrag,
    error,
    isLoading,
    isSaving: pendingOperations > 0,
    load,
    previewChapters,
    removeItem,
    renameItem,
    restoreChapters,
    saveContent,
    toggleChapter,
    toggleTopic,
  };
}
