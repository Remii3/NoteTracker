import type { Chapter, ChapterSummary, Topic } from "./types";

export type NotesState = {
  chapterIds: string[];
  chaptersById: Record<string, ChapterSummary>;
  topicIdsByChapterId: Record<string, string[]>;
  topicsById: Record<string, Topic>;
};

export function normalizeChapters(chapters: Chapter[]): NotesState {
  const state: NotesState = {
    chapterIds: [],
    chaptersById: {},
    topicIdsByChapterId: {},
    topicsById: {},
  };

  for (const { topics, ...chapter } of chapters) {
    state.chapterIds.push(chapter.id);
    state.chaptersById[chapter.id] = chapter;
    state.topicIdsByChapterId[chapter.id] = topics.map((topic) => topic.id);
    for (const topic of topics) state.topicsById[topic.id] = topic;
  }
  return state;
}

export function materializeChapters(state: NotesState): Chapter[] {
  return state.chapterIds.flatMap((chapterId) => {
    const chapter = state.chaptersById[chapterId];
    if (!chapter) return [];
    const topics = (state.topicIdsByChapterId[chapterId] ?? []).flatMap(
      (topicId) => {
        const topic = state.topicsById[topicId];
        return topic ? [topic] : [];
      },
    );
    return [{ ...chapter, topics }];
  });
}
