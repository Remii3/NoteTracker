import { useCallback, useEffect } from "react";
import { matchPath, useBlocker, useLocation, useNavigate } from "react-router";

import type { Chapter } from "../model/types";
import type { ActiveView } from "../model/workspace-types";

type Options = {
  chapters: Chapter[];
  isTopicDirty: (topicId: string) => boolean;
};

export function useWorkspaceRoute({ chapters, isTopicDirty }: Options) {
  const location = useLocation();
  const navigate = useNavigate();
  const topicRoute = matchPath(
    "/chapters/:chapterId/:topicId",
    location.pathname,
  );
  const chapterRoute = matchPath("/chapters/:chapterId", location.pathname);
  const chapterId =
    topicRoute?.params.chapterId ?? chapterRoute?.params.chapterId ?? "";
  const topicId = topicRoute?.params.topicId ?? "";
  const activeView: ActiveView = chapterId ? "notes" : "home";
  const chapter = chapters.find((item) => item.id === chapterId);
  const topic = chapter?.topics.find((item) => item.id === topicId);
  const editorDirty = Boolean(topic && isTopicDirty(topic.id));

  const navigateToChapter = useCallback(
    (nextChapterId: string, nextTopicId = "", replace = false) => {
      const path = nextTopicId
        ? `/chapters/${nextChapterId}/${nextTopicId}`
        : `/chapters/${nextChapterId}`;
      navigate(path, { replace });
    },
    [navigate],
  );
  const navigateHome = useCallback(() => navigate("/"), [navigate]);

  const navigationBlocker = useBlocker(
    ({ nextLocation }) =>
      editorDirty &&
      matchPath("/chapters/:chapterId/:topicId", nextLocation.pathname)?.params
        .topicId !== topicId,
  );

  useEffect(() => {
    if (activeView !== "notes") return;
    if (!chapter) {
      navigate("/", { replace: true });
      return;
    }
    if (topic) return;

    const firstTopic = chapter.topics[0];
    if (firstTopic) {
      navigate(`/chapters/${chapter.id}/${firstTopic.id}`, { replace: true });
    }
  }, [activeView, chapter, navigate, topic]);

  return {
    activeView,
    chapter,
    chapterId,
    editorDirty,
    navigateHome,
    navigateToChapter,
    navigationBlocker,
    topic,
    topicId,
  };
}
