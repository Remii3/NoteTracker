import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { memoryNotesRepository } from "../data/memory-notes-repository";
import type { NotesRepository } from "../data/notes-repository";
import {
  addChaptersToCollection,
  addTopicsToChapter,
  deleteManagedItem,
  deleteManagedItems,
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
import type {
  Chapter,
  LearningSummary,
  NoteContent,
  Topic,
  TopicNavigation,
} from "../model/types";
import type { ManagedItem } from "../model/workspace-types";

type Options = {
  repository?: NotesRepository;
  initialChapters?: Chapter[];
  loadOnMount?: boolean;
};

const CHAPTER_TOPICS_CACHE_LIMIT = 20;
type ChapterLoadOptions = { prefetch?: boolean };

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
  const chapterRequestsRef = useRef(new Map<string, Promise<Topic[] | null>>());
  const chapterCacheOrderRef = useRef(new Map<string, number>());
  const activeChapterIdRef = useRef<string | null>(null);
  const cacheSequenceRef = useRef(0);
  const searchRequestRef = useRef(0);
  const navigationRequestRef = useRef(0);
  const [isLoading, setIsLoading] = useState(loadOnMount);
  const [searchResults, setSearchResults] = useState<Chapter[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [learningSummary, setLearningSummary] =
    useState<LearningSummary | null>(null);
  const [topicNavigation, setTopicNavigation] =
    useState<TopicNavigation | null>(null);
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

  const refreshSummaries = useCallback(async () => {
    const [summaries, summary] = await Promise.all([
      repository.listChapters(),
      repository.getLearningSummary(),
    ]);
    const currentById = new Map(
      materializeChapters(stateRef.current).map((chapter) => [
        chapter.id,
        chapter,
      ]),
    );
    applyChapters(
      summaries.map((chapter) => {
        const current = currentById.get(chapter.id);
        return current?.topicsStatus === "loaded"
          ? {
              ...chapter,
              topics: current.topics,
              topicsStatus: "loaded",
            }
          : chapter;
      }),
    );
    setLearningSummary(summary);
  }, [applyChapters, repository]);

  const runOptimistic = useCallback(
    async (
      updater: (chapters: Chapter[]) => Chapter[],
      persist: (next: Chapter[]) => Promise<void>,
      errorMessage: string,
      refreshChapterData = false,
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
        if (refreshChapterData) await refreshSummaries();
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
    [applyChapters, refreshSummaries],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [page, summary] = await Promise.all([
        repository.listChapters(),
        repository.getLearningSummary(),
      ]);
      applyChapters(page);
      setLearningSummary(summary);
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

  const loadChapterTopics = useCallback(
    (chapterId: string, options: ChapterLoadOptions = {}) => {
      if (!options.prefetch) activeChapterIdRef.current = chapterId;
      chapterCacheOrderRef.current.delete(chapterId);
      chapterCacheOrderRef.current.set(chapterId, ++cacheSequenceRef.current);

      const chapter = materializeChapters(stateRef.current).find(
        (item) => item.id === chapterId,
      );
      if (!chapter) return Promise.resolve(null);
      if (chapter.topicsStatus === "loaded")
        return Promise.resolve(chapter.topics);
      const pending = chapterRequestsRef.current.get(chapterId);
      if (pending) return pending;

      applyChapters(
        materializeChapters(stateRef.current).map((item) =>
          item.id === chapterId ? { ...item, topicsStatus: "loading" } : item,
        ),
      );
      const request = repository
        .listChapterTopics(chapterId)
        .then((topics) => {
          const latest = materializeChapters(stateRef.current);
          const loadedChapterIds = latest
            .filter(
              (item) => item.id !== chapterId && item.topicsStatus === "loaded",
            )
            .map((item) => item.id);
          const excess = Math.max(
            0,
            loadedChapterIds.length + 1 - CHAPTER_TOPICS_CACHE_LIMIT,
          );
          const evictedIds = new Set(
            loadedChapterIds
              .filter((id) => id !== activeChapterIdRef.current)
              .sort(
                (first, second) =>
                  (chapterCacheOrderRef.current.get(first) ?? 0) -
                  (chapterCacheOrderRef.current.get(second) ?? 0),
              )
              .slice(0, excess),
          );
          for (const id of evictedIds) chapterCacheOrderRef.current.delete(id);
          applyChapters(
            latest.map((item) =>
              item.id === chapterId
                ? { ...item, topics, topicsStatus: "loaded" }
                : evictedIds.has(item.id)
                  ? { ...item, topics: [], topicsStatus: "idle" }
                  : item,
            ),
          );
          return topics;
        })
        .catch((caughtError) => {
          const latest = materializeChapters(stateRef.current);
          applyChapters(
            latest.map((item) =>
              item.id === chapterId ? { ...item, topicsStatus: "error" } : item,
            ),
          );
          setError(
            getErrorMessage(caughtError, "Nie udało się pobrać tematów."),
          );
          return null;
        })
        .finally(() => chapterRequestsRef.current.delete(chapterId));
      chapterRequestsRef.current.set(chapterId, request);
      return request;
    },
    [applyChapters, repository],
  );

  const loadTopicNavigation = useCallback(
    async (topicId: string) => {
      const requestId = ++navigationRequestRef.current;
      try {
        const navigation = await repository.getTopicNavigation(topicId);
        if (requestId === navigationRequestRef.current)
          setTopicNavigation(navigation);
        return navigation;
      } catch (caughtError) {
        setError(
          getErrorMessage(caughtError, "Nie udało się pobrać nawigacji."),
        );
        return null;
      }
    },
    [repository],
  );

  const loadTopicContent = useCallback(
    async (chapterId: string, topicId: string) => {
      const current = materializeChapters(stateRef.current);
      const currentTopic = current
        .find((chapter) => chapter.id === chapterId)
        ?.topics.find((topic) => topic.id === topicId);
      if (!currentTopic || currentTopic.contentLoaded) return true;
      try {
        const content = await repository.getTopicContent(chapterId, topicId);
        const latest = materializeChapters(stateRef.current);
        applyChapters(
          updateTopic(latest, chapterId, topicId, (topic) => ({
            ...topic,
            content,
            contentLoaded: true,
          })),
        );
        return true;
      } catch (caughtError) {
        setError(getErrorMessage(caughtError, "Nie udało się pobrać notatki."));
        return false;
      }
    },
    [applyChapters, repository],
  );

  const searchChapters = useCallback(
    async (query: string) => {
      const requestId = ++searchRequestRef.current;
      const phrase = query.trim();
      if (!phrase) {
        setSearchResults(null);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      try {
        const results = await repository.searchChapters(phrase);
        if (requestId === searchRequestRef.current) setSearchResults(results);
      } catch (caughtError) {
        setError(
          getErrorMessage(caughtError, "Nie udało się wyszukać notatek."),
        );
      } finally {
        if (requestId === searchRequestRef.current) setIsSearching(false);
      }
    },
    [repository],
  );

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
        await refreshSummaries();
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
    [applyChapters, refreshSummaries, repository],
  );

  const addChapters = useCallback(
    (chapters: Chapter[]) =>
      runOptimistic(
        (current) => addChaptersToCollection(current, chapters),
        () => repository.createChapters(chapters),
        "Nie udało się dodać rozdziałów.",
        true,
      ),
    [repository, runOptimistic],
  );
  const addTopics = useCallback(
    (chapterId: string, topics: Topic[]) =>
      runOptimistic(
        (current) => addTopicsToChapter(current, chapterId, topics),
        () => repository.createTopics(chapterId, topics),
        "Nie udało się dodać tematów.",
        true,
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
        true,
      ),
    [repository, runOptimistic],
  );
  const removeItems = useCallback(
    (chapterIds: string[], topicIds: string[]) =>
      runOptimistic(
        (current) => deleteManagedItems(current, chapterIds, topicIds),
        () => repository.deleteItems(chapterIds, topicIds),
        "Nie udało się usunąć wybranych elementów.",
        true,
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
        true,
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
        true,
      ),
    [repository, runOptimistic],
  );

  return {
    addChapters,
    addTopics,
    chapters,
    clearError,
    commitDrag,
    error,
    isLoading,
    isSearching,
    isSaving: pendingOperations > 0,
    load,
    loadChapterTopics,
    loadTopicNavigation,
    loadTopicContent,
    searchChapters,
    searchResults,
    learningSummary,
    topicNavigation,
    previewChapters,
    removeItem,
    removeItems,
    renameItem,
    restoreChapters,
    saveContent,
    toggleChapter,
    toggleTopic,
  };
}
