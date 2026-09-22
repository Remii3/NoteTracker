import { useCallback, useEffect } from "react";
import { useBlocker, useMatches, useNavigate, useParams } from "react-router";

import type { Chapter } from "../types/model";
import type { ModuleRouteHandle } from "../types/workspace-types";

type Options = {
  chapters: Chapter[];
  isTopicDirty: (topicId: string) => boolean;
  isLoading?: boolean;
  loadFailed?: boolean;
  resolveChapterTopics: (chapterId: string) => Promise<unknown>;
  blockDirtyNavigation?: boolean;
};

export function useWorkspaceRoute({
  chapters,
  isTopicDirty,
  isLoading = false,
  loadFailed = false,
  resolveChapterTopics,
  blockDirtyNavigation = true,
}: Options) {
  const matches = useMatches();
  const navigate = useNavigate();
  const { moduleSlug = "", studyMode: routeStudyMode } = useParams<{
    moduleSlug: string;
    studyMode?: string;
  }>();
  const basePath = `/${moduleSlug}`;
  const leafMatch = matches.at(-1);
  const routeHandle = leafMatch?.handle as ModuleRouteHandle | undefined;
  const activeView = routeHandle?.activeView ?? "chapters";
  const chapterSlug = leafMatch?.params.chapterSlug ?? "";
  const topicSlug = leafMatch?.params.topicSlug ?? "";
  const chapter = chapters.find(
    (item) => item.slug === chapterSlug || item.id === chapterSlug,
  );
  const topic = chapter?.topics.find(
    (item) => item.slug === topicSlug || item.id === topicSlug,
  );
  const chapterId = chapter?.id ?? "";
  const topicId = topic?.id ?? "";
  const editorDirty = Boolean(topic && isTopicDirty(topic.id));
  const studyMode: "flashcards" | "test" | undefined =
    routeStudyMode === "test" || routeStudyMode === "flashcards"
      ? routeStudyMode
      : undefined;

  const navigateToChapter = useCallback(
    (nextChapterId: string, nextTopicId = "", replace = false) => {
      const nextChapter = chapters.find((item) => item.id === nextChapterId);
      if (!nextChapter) return;
      const nextTopic = nextChapter.topics.find(
        (item) => item.id === nextTopicId,
      );
      const path = nextTopic
        ? `${basePath}/chapters/${nextChapter.slug}/${nextTopic.slug}`
        : `${basePath}/chapters/${nextChapter.slug}`;
      navigate(path, { replace });
    },
    [basePath, chapters, navigate],
  );
  const navigateHome = useCallback(
    () => navigate(basePath),
    [basePath, navigate],
  );
  const navigateChapters = useCallback(
    () => navigate(basePath),
    [basePath, navigate],
  );
  const navigateGallery = useCallback(
    () => navigate(`${basePath}/gallery`),
    [basePath, navigate],
  );
  const navigateQuestions = useCallback(
    () => navigate(`${basePath}/questions`),
    [basePath, navigate],
  );
  const navigateStatistics = useCallback(
    () => navigate(`${basePath}/statistics`),
    [basePath, navigate],
  );
  const navigateExams = useCallback(
    () => navigate(`${basePath}/exams`),
    [basePath, navigate],
  );
  const navigateQuestionHistory = useCallback(
    () => navigate(`${basePath}/questions/history`),
    [basePath, navigate],
  );
  const navigateStudySession = useCallback(
    (mode: string, id: string) => navigate(`${basePath}/study/${mode}/${id}`),
    [basePath, navigate],
  );

  const navigationBlocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      blockDirtyNavigation &&
      editorDirty &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (isLoading || loadFailed) return;
    if (activeView !== "notes") return;
    if (!chapter) {
      navigate(basePath, { replace: true });
      return;
    }
    if (chapter.topicsStatus === "idle") {
      void resolveChapterTopics(chapter.id);
      return;
    }
    if (chapter.topicsStatus !== "loaded") return;
    if (topic) {
      if (chapterSlug !== chapter.slug || topicSlug !== topic.slug) {
        navigate(`${basePath}/chapters/${chapter.slug}/${topic.slug}`, {
          replace: true,
        });
      }
      return;
    }

    const firstTopic = chapter.topics[0];
    if (firstTopic) {
      navigate(`${basePath}/chapters/${chapter.slug}/${firstTopic.slug}`, {
        replace: true,
      });
    } else if (chapterSlug !== chapter.slug || topicSlug) {
      navigate(`${basePath}/chapters/${chapter.slug}`, { replace: true });
    }
  }, [
    activeView,
    basePath,
    chapter,
    chapterSlug,
    isLoading,
    loadFailed,
    navigate,
    resolveChapterTopics,
    topic,
    topicSlug,
  ]);

  return {
    activeView,
    chapter,
    chapterId,
    editorDirty,
    navigateHome,
    navigateChapters,
    navigateGallery,
    navigateQuestions,
    navigateStatistics,
    navigateExams,
    navigateQuestionHistory,
    navigateStudySession,
    navigateToChapter,
    navigationBlocker,
    topic,
    topicId,
    isQuestionHistory: routeHandle?.moduleView === "question-history",
    showHeader: routeHandle?.showHeader ?? true,
    studyMode,
  };
}
