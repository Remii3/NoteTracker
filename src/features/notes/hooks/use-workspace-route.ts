import { useCallback, useEffect } from "react";
import {
  matchPath,
  useBlocker,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";

import type { Chapter } from "../model/types";
import type { ActiveView } from "../model/workspace-types";

type Options = {
  chapters: Chapter[];
  isTopicDirty: (topicId: string) => boolean;
  isLoading?: boolean;
  resolveChapterTopics: (chapterId: string) => Promise<unknown>;
};

export function useWorkspaceRoute({
  chapters,
  isTopicDirty,
  isLoading = false,
  resolveChapterTopics,
}: Options) {
  const location = useLocation();
  const navigate = useNavigate();
  const { moduleId = "" } = useParams<{ moduleId: string }>();
  const basePath = `/modules/${moduleId}`;
  const topicRoute = matchPath(
    "/modules/:moduleId/chapters/:chapterSlug/:topicSlug",
    location.pathname,
  );
  const chapterRoute = matchPath(
    "/modules/:moduleId/chapters/:chapterSlug",
    location.pathname,
  );
  const chapterSlug =
    topicRoute?.params.chapterSlug ?? chapterRoute?.params.chapterSlug ?? "";
  const topicSlug = topicRoute?.params.topicSlug ?? "";
  const activeView: ActiveView = chapterSlug
    ? "notes"
    : location.pathname.startsWith(`${basePath}/questions`) ||
        location.pathname.startsWith(`${basePath}/study/`)
      ? "questions"
      : location.pathname === `${basePath}/gallery`
        ? "gallery"
        : location.pathname === `${basePath}/chapters`
          ? "chapters"
          : "home";
  const chapter = chapters.find(
    (item) => item.slug === chapterSlug || item.id === chapterSlug,
  );
  const topic = chapter?.topics.find(
    (item) => item.slug === topicSlug || item.id === topicSlug,
  );
  const chapterId = chapter?.id ?? "";
  const topicId = topic?.id ?? "";
  const editorDirty = Boolean(topic && isTopicDirty(topic.id));

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
    () => navigate(`${basePath}/chapters`),
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
  const navigateQuestionHistory = useCallback(
    () => navigate(`${basePath}/questions/history`),
    [basePath, navigate],
  );
  const navigateStudySession = useCallback(
    (mode: string, id: string) => navigate(`${basePath}/study/${mode}/${id}`),
    [basePath, navigate],
  );

  const navigationBlocker = useBlocker(
    ({ nextLocation }) =>
      editorDirty &&
      matchPath(
        "/modules/:moduleId/chapters/:chapterSlug/:topicSlug",
        nextLocation.pathname,
      )?.params.topicSlug !== topic?.slug,
  );

  useEffect(() => {
    if (isLoading) return;
    if (activeView !== "notes") return;
    if (!chapter) {
      navigate(basePath, { replace: true });
      return;
    }
    if (chapter.topicsStatus !== "loaded") {
      void resolveChapterTopics(chapter.id);
      return;
    }
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
    navigateQuestionHistory,
    navigateStudySession,
    navigateToChapter,
    navigationBlocker,
    topic,
    topicId,
    isQuestionHistory: location.pathname === `${basePath}/questions/history`,
  };
}
