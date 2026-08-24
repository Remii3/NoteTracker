import type {
  ChapterSummary,
  LearningSummary,
  NoteContent,
  Topic,
  TopicNavigation,
} from "../model/types";

export type ChapterUpdate = Partial<Pick<ChapterSummary, "title" | "position">>;
export type TopicUpdate = Partial<
  Pick<Topic, "title" | "completed" | "position">
>;

export interface NotesRepository {
  listChapters(): Promise<import("../model/types").Chapter[]>;
  listChapterTopics(chapterId: string): Promise<Topic[]>;
  getTopicContent(chapterId: string, topicId: string): Promise<NoteContent>;
  getTopicNavigation(topicId: string): Promise<TopicNavigation>;
  searchChapters(
    query: string,
    limit?: number,
  ): Promise<import("../model/types").Chapter[]>;
  getLearningSummary(): Promise<LearningSummary>;
  createChapter(chapter: ChapterSummary): Promise<void>;
  updateChapter(chapterId: string, update: ChapterUpdate): Promise<void>;
  deleteChapter(chapterId: string): Promise<void>;
  createTopics(chapterId: string, topics: Topic[]): Promise<void>;
  updateTopic(
    chapterId: string,
    topicId: string,
    update: TopicUpdate,
  ): Promise<void>;
  updateTopicContent(
    chapterId: string,
    topicId: string,
    content: NoteContent,
  ): Promise<void>;
  deleteTopic(chapterId: string, topicId: string): Promise<void>;
  setChapterCompleted(chapterId: string, completed: boolean): Promise<void>;
  reorderChapters(chapterIds: string[]): Promise<void>;
  reorderTopics(chapterId: string, topicIds: string[]): Promise<void>;
  moveTopic(
    topicId: string,
    sourceChapterId: string,
    targetChapterId: string,
    targetSlug: string,
    sourceTopicIds: string[],
    targetTopicIds: string[],
  ): Promise<void>;
}
