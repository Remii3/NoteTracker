import type { Chapter } from "../model/types";
import type { SortMode } from "../model/workspace-types";

export function isChapterCompleted(chapter: Chapter) {
  return (
    chapter.topicsCount > 0 &&
    chapter.completedTopicsCount === chapter.topicsCount
  );
}

export function getProgress(completed: number, total: number) {
  return total ? Math.round((completed / total) * 100) : 0;
}

export function selectDashboardSummary(chapters: Chapter[]) {
  const topics = chapters.flatMap((chapter) =>
    chapter.topics.map((topic) => ({ ...topic, chapterId: chapter.id })),
  );
  const completedTopics = chapters.reduce(
    (sum, chapter) => sum + chapter.completedTopicsCount,
    0,
  );
  const completedChapters = chapters.filter(isChapterCompleted).length;
  const totalTopics = chapters.reduce(
    (sum, chapter) => sum + chapter.topicsCount,
    0,
  );
  const progress = getProgress(completedTopics, totalTopics);

  return {
    completedChapters,
    completedTopics,
    nextTopic: topics.find((topic) => !topic.completed),
    progress,
    totalTopics,
  };
}

export function selectVisibleChapters(
  chapters: Chapter[],
  search: string,
  sortMode: SortMode,
) {
  const phrase = search.trim().toLocaleLowerCase("pl");
  const filtered = phrase
    ? chapters.flatMap((chapter) => {
        const chapterMatches = chapter.title
          .toLocaleLowerCase("pl")
          .includes(phrase);
        const matchingTopics = chapter.topics.filter((topic) =>
          topic.title.toLocaleLowerCase("pl").includes(phrase),
        );

        if (!chapterMatches && !matchingTopics.length) return [];
        return [{ ...chapter, topics: matchingTopics }];
      })
    : chapters;

  return [...filtered].sort((first, second) => {
    if (sortMode === "manual") return first.position - second.position;
    if (sortMode === "az") return first.title.localeCompare(second.title, "pl");
    if (sortMode === "za") return second.title.localeCompare(first.title, "pl");

    const firstCompleted = Number(isChapterCompleted(first));
    const secondCompleted = Number(isChapterCompleted(second));
    const statusOrder =
      sortMode === "completed"
        ? secondCompleted - firstCompleted
        : firstCompleted - secondCompleted;

    return statusOrder || first.position - second.position;
  });
}
