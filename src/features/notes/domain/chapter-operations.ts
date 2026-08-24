import { arrayMove } from "@dnd-kit/sortable";

import { createUniqueSlug } from "../lib/slug-utils";
import type { Chapter, NoteContent, Topic } from "../model/types";
import type { ManagedItem } from "../model/workspace-types";

export function withPositions<T extends { position: number }>(items: T[]): T[] {
  return items.map((item, index) => ({
    ...item,
    position: (index + 1) * 1000,
  }));
}

export function updateChapter(
  chapters: Chapter[],
  chapterId: string,
  updater: (chapter: Chapter) => Chapter,
) {
  return chapters.map((chapter) =>
    chapter.id === chapterId ? updater(chapter) : chapter,
  );
}

function syncChapterSummary(chapter: Chapter): Chapter {
  if (chapter.topicsStatus !== "loaded") return chapter;
  const firstIncomplete = chapter.topics.find((topic) => !topic.completed);
  return {
    ...chapter,
    topicsCount: chapter.topics.length,
    completedTopicsCount: chapter.topics.filter((topic) => topic.completed)
      .length,
    firstIncompleteTopicId: firstIncomplete?.id ?? null,
    firstIncompleteTopicSlug: firstIncomplete?.slug ?? null,
  };
}

export function toggleChapterTopics(
  chapters: Chapter[],
  chapterId: string,
  completed: boolean,
) {
  return updateChapter(chapters, chapterId, (chapter) =>
    syncChapterSummary({
      ...chapter,
      topics: chapter.topics.map((topic) => ({ ...topic, completed })),
      completedTopicsCount: completed ? chapter.topicsCount : 0,
      firstIncompleteTopicId: completed
        ? null
        : (chapter.topics[0]?.id ?? chapter.firstIncompleteTopicId),
      firstIncompleteTopicSlug: completed
        ? null
        : (chapter.topics[0]?.slug ?? chapter.firstIncompleteTopicSlug),
    }),
  );
}

export function updateTopic(
  chapters: Chapter[],
  chapterId: string,
  topicId: string,
  updater: (topic: Topic) => Topic,
) {
  return updateChapter(chapters, chapterId, (chapter) =>
    syncChapterSummary({
      ...chapter,
      topics: chapter.topics.map((topic) =>
        topic.id === topicId ? updater(topic) : topic,
      ),
    }),
  );
}

export function addChapterToCollection(chapters: Chapter[], chapter: Chapter) {
  return [...chapters, chapter];
}

export function addTopicsToChapter(
  chapters: Chapter[],
  chapterId: string,
  topics: Topic[],
) {
  return updateChapter(chapters, chapterId, (chapter) =>
    syncChapterSummary({
      ...chapter,
      topics: [...chapter.topics, ...topics],
      topicsStatus: "loaded",
    }),
  );
}

export function renameManagedItem(
  chapters: Chapter[],
  item: ManagedItem,
  title: string,
) {
  if (item.kind === "chapter") {
    return updateChapter(chapters, item.id, (chapter) => ({
      ...chapter,
      title,
    }));
  }
  return updateTopic(chapters, item.chapterId, item.id, (topic) => ({
    ...topic,
    title,
  }));
}

export function deleteManagedItem(chapters: Chapter[], item: ManagedItem) {
  if (item.kind === "chapter") {
    return chapters.filter((chapter) => chapter.id !== item.id);
  }
  return updateChapter(chapters, item.chapterId, (chapter) =>
    syncChapterSummary({
      ...chapter,
      topics: chapter.topics.filter((topic) => topic.id !== item.id),
    }),
  );
}

export function deleteManagedItems(
  chapters: Chapter[],
  chapterIds: string[],
  topicIds: string[],
) {
  const selectedChapters = new Set(chapterIds);
  const selectedTopics = new Set(topicIds);
  return chapters
    .filter((chapter) => !selectedChapters.has(chapter.id))
    .map((chapter) =>
      syncChapterSummary({
        ...chapter,
        topics: chapter.topics.filter((topic) => !selectedTopics.has(topic.id)),
        topicsCount:
          chapter.topicsStatus === "loaded"
            ? chapter.topics.filter((topic) => !selectedTopics.has(topic.id))
                .length
            : Math.max(
                0,
                chapter.topicsCount -
                  chapter.topics.filter((topic) => selectedTopics.has(topic.id))
                    .length,
              ),
      }),
    );
}

export function saveTopicContent(
  chapters: Chapter[],
  chapterId: string,
  topicId: string,
  content: NoteContent,
) {
  return updateTopic(chapters, chapterId, topicId, (topic) => ({
    ...topic,
    content,
  }));
}

export function reorderChapters(
  chapters: Chapter[],
  activeId: string,
  overId: string,
) {
  const from = chapters.findIndex((chapter) => chapter.id === activeId);
  const to = chapters.findIndex((chapter) => chapter.id === overId);
  return from < 0 || to < 0
    ? chapters
    : withPositions(arrayMove(chapters, from, to));
}

export function reorderTopic(
  chapters: Chapter[],
  chapterId: string,
  activeId: string,
  overId: string,
) {
  return updateChapter(chapters, chapterId, (chapter) => {
    const from = chapter.topics.findIndex((topic) => topic.id === activeId);
    const to = chapter.topics.findIndex((topic) => topic.id === overId);
    if (from < 0 || to < 0) return chapter;
    return {
      ...chapter,
      topics: withPositions(arrayMove(chapter.topics, from, to)),
    };
  });
}

export function moveTopic(
  chapters: Chapter[],
  topicId: string,
  targetChapterId: string,
  targetIndex: number,
) {
  const source = chapters.find((chapter) =>
    chapter.topics.some((topic) => topic.id === topicId),
  );
  const topic = source?.topics.find((item) => item.id === topicId);
  const target = chapters.find((chapter) => chapter.id === targetChapterId);
  if (!source || !topic || !target || source.id === targetChapterId)
    return chapters;
  const topicForTarget = target.topics.some((item) => item.slug === topic.slug)
    ? {
        ...topic,
        slug: createUniqueSlug(
          topic.title,
          target.topics.map((item) => item.slug),
          "temat",
        ),
      }
    : topic;

  return chapters.map((chapter) => {
    if (chapter.id === source.id) {
      return syncChapterSummary({
        ...chapter,
        topics: withPositions(
          chapter.topics.filter((item) => item.id !== topicId),
        ),
      });
    }
    if (chapter.id === targetChapterId) {
      const topics = [...chapter.topics];
      topics.splice(
        targetIndex < 0 ? topics.length : targetIndex,
        0,
        topicForTarget,
      );
      return syncChapterSummary({ ...chapter, topics: withPositions(topics) });
    }
    return chapter;
  });
}
