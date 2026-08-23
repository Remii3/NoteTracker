import type { Chapter } from "../model/types";
import type { SortMode, StudyTopic } from "../model/workspace-types";

export function isChapterCompleted(chapter: Chapter) {
  return (
    chapter.topics.length > 0 &&
    chapter.topics.every((topic) => topic.completed)
  );
}

export function getProgress(completed: number, total: number) {
  return total ? Math.round((completed / total) * 100) : 0;
}

export function selectChapterNextTopic(chapter: Chapter) {
  const orderedTopics = [...chapter.topics].sort(
    (first, second) => first.position - second.position,
  );
  return (
    orderedTopics.find((topic) => !topic.completed) ?? orderedTopics[0] ?? null
  );
}

export function selectDashboardSummary(chapters: Chapter[]) {
  const topics = chapters.flatMap((chapter) =>
    chapter.topics.map((topic) => ({ ...topic, chapterId: chapter.id })),
  );
  const completedTopics = topics.filter((topic) => topic.completed).length;
  const completedChapters = chapters.filter(isChapterCompleted).length;
  const progress = getProgress(completedTopics, topics.length);

  return {
    completedChapters,
    completedTopics,
    nextTopic: topics.find((topic) => !topic.completed),
    progress,
    totalTopics: topics.length,
  };
}

export function selectStudyTopics(chapters: Chapter[]): StudyTopic[] {
  return [...chapters]
    .sort((first, second) => first.position - second.position)
    .flatMap((chapter) =>
      [...chapter.topics]
        .sort((first, second) => first.position - second.position)
        .map((topic) => ({
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          topicId: topic.id,
          topicTitle: topic.title,
        })),
    );
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
