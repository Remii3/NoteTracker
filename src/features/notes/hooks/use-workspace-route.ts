import { useCallback, useEffect } from "react";
import { matchPath, useBlocker, useLocation, useNavigate } from "react-router";

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
  const topicRoute = matchPath(
    "/chapters/:chapterSlug/:topicSlug",
    location.pathname,
  );
  const chapterRoute = matchPath("/chapters/:chapterSlug", location.pathname);
  const chapterSlug =
    topicRoute?.params.chapterSlug ?? chapterRoute?.params.chapterSlug ?? "";
  const topicSlug = topicRoute?.params.topicSlug ?? "";
  const activeView: ActiveView = chapterSlug
    ? "notes"
    : location.pathname === "/chapters"
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
        ? `/chapters/${nextChapter.slug}/${nextTopic.slug}`
        : `/chapters/${nextChapter.slug}`;
      navigate(path, { replace });
    },
    [chapters, navigate],
  );
  const navigateHome = useCallback(() => navigate("/"), [navigate]);
  const navigateChapters = useCallback(() => navigate("/chapters"), [navigate]);

  const navigationBlocker = useBlocker(
    ({ nextLocation }) =>
      editorDirty &&
      matchPath("/chapters/:chapterSlug/:topicSlug", nextLocation.pathname)
        ?.params.topicSlug !== topic?.slug,
  );

  useEffect(() => {
    if (isLoading) return;
    if (activeView !== "notes") return;
    if (!chapter) {
      navigate("/", { replace: true });
      return;
    }
    if (chapter.topicsStatus !== "loaded") {
      void resolveChapterTopics(chapter.id);
      return;
    }
    if (topic) {
      if (chapterSlug !== chapter.slug || topicSlug !== topic.slug) {
        navigate(`/chapters/${chapter.slug}/${topic.slug}`, { replace: true });
      }
      return;
    }

    const firstTopic = chapter.topics[0];
    if (firstTopic) {
      navigate(`/chapters/${chapter.slug}/${firstTopic.slug}`, {
        replace: true,
      });
    } else if (chapterSlug !== chapter.slug || topicSlug) {
      navigate(`/chapters/${chapter.slug}`, { replace: true });
    }
  }, [
    activeView,
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
    navigateToChapter,
    navigationBlocker,
    topic,
    topicId,
  };
}
