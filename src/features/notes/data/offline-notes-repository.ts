import { createTopicNavigation } from "../lib/topic-navigation";
import type { OfflineModuleService } from "../offline/offline-module-service";
import type { Chapter, LearningSummary, Topic } from "../types/model";
import type {
  ChapterUpdate,
  NotesRepository,
  TopicUpdate,
} from "./notes-repository";

export class OfflineNotesRepository implements NotesRepository {
  private readonly online: NotesRepository;
  private readonly moduleId: string;
  private readonly offline: OfflineModuleService;

  constructor(
    online: NotesRepository,
    moduleId: string,
    offline: OfflineModuleService,
  ) {
    this.online = online;
    this.moduleId = moduleId;
    this.offline = offline;
  }

  getOfflineChanges(changedSince?: string, includeImages?: boolean) {
    return this.online.getOfflineChanges(changedSince, includeImages);
  }

  async listChapters() {
    return this.withFallback(
      () => this.online.listChapters(),
      async () => (await this.cachedChapters()).map(toChapterSummary),
    );
  }

  async listChapterTopics(chapterId: string) {
    return this.withFallback(
      () => this.online.listChapterTopics(chapterId),
      async () =>
        (await this.cachedChapters()).find(
          (chapter) => chapter.id === chapterId,
        )?.topics ?? [],
    );
  }

  async getTopicContent(chapterId: string, topicId: string) {
    return this.withFallback(
      () => this.online.getTopicContent(chapterId, topicId),
      async () => {
        const topic = (await this.cachedChapters())
          .find((chapter) => chapter.id === chapterId)
          ?.topics.find((item) => item.id === topicId);
        if (!topic) throw new Error("Ten temat nie jest dostępny offline.");
        return topic.content;
      },
    );
  }

  async getTopicNavigation(topicId: string) {
    return this.withFallback(
      () => this.online.getTopicNavigation(topicId),
      async () =>
        createTopicNavigation(
          (await this.cachedChapters()).flatMap((chapter) =>
            chapter.topics.map((topic) => ({
              chapterId: chapter.id,
              chapterSlug: chapter.slug,
              chapterTitle: chapter.title,
              topicId: topic.id,
              topicSlug: topic.slug,
              topicTitle: topic.title,
            })),
          ),
          topicId,
        ),
    );
  }

  async searchChapters(query: string, limit = 100) {
    return this.withFallback(
      () => this.online.searchChapters(query, limit),
      async () => {
        const phrase = query.toLocaleLowerCase("pl");
        return (await this.cachedChapters())
          .flatMap((chapter) => {
            const topics = chapter.topics.filter((topic) =>
              topic.title.toLocaleLowerCase("pl").includes(phrase),
            );
            return chapter.title.toLocaleLowerCase("pl").includes(phrase) ||
              topics.length
              ? [{ ...chapter, topics }]
              : [];
          })
          .slice(0, limit);
      },
    );
  }

  async getLearningSummary(): Promise<LearningSummary> {
    return this.withFallback(
      () => this.online.getLearningSummary(),
      async () => {
        const chapters = await this.cachedChapters();
        const topics = chapters.flatMap((chapter) =>
          chapter.topics.map((topic) => ({ chapterId: chapter.id, topic })),
        );
        const next = topics.find(({ topic }) => !topic.completed);
        return {
          completedChapters: chapters.filter(
            (chapter) =>
              chapter.topics.length > 0 &&
              chapter.topics.every((topic) => topic.completed),
          ).length,
          completedTopics: topics.filter(({ topic }) => topic.completed).length,
          nextTopic: next
            ? { chapterId: next.chapterId, id: next.topic.id }
            : null,
          totalChapters: chapters.length,
          totalTopics: topics.length,
        };
      },
    );
  }

  createChapterWithTopics(
    ...args: Parameters<NotesRepository["createChapterWithTopics"]>
  ) {
    return this.afterWrite(() => this.online.createChapterWithTopics(...args));
  }
  updateChapter(chapterId: string, update: ChapterUpdate) {
    return this.afterWrite(() => this.online.updateChapter(chapterId, update));
  }
  deleteChapter(chapterId: string) {
    return this.afterWrite(() => this.online.deleteChapter(chapterId));
  }
  createTopics(chapterId: string, topics: Topic[]) {
    return this.afterWrite(() => this.online.createTopics(chapterId, topics));
  }
  updateTopic(chapterId: string, topicId: string, update: TopicUpdate) {
    return this.afterWrite(() =>
      this.online.updateTopic(chapterId, topicId, update),
    );
  }
  async updateTopicContent(
    chapterId: string,
    topicId: string,
    content: Topic["content"],
    expectedContent: Topic["content"],
  ) {
    await this.online.updateTopicContent(
      chapterId,
      topicId,
      content,
      expectedContent,
    );
    await this.offline
      .updateTopicContent(this.moduleId, topicId, content)
      .catch(() => undefined);
  }
  deleteTopic(chapterId: string, topicId: string) {
    return this.afterWrite(() => this.online.deleteTopic(chapterId, topicId));
  }
  deleteItems(chapterIds: string[], topicIds: string[]) {
    return this.afterWrite(() => this.online.deleteItems(chapterIds, topicIds));
  }
  setChapterCompleted(chapterId: string, completed: boolean) {
    return this.afterWrite(() =>
      this.online.setChapterCompleted(chapterId, completed),
    );
  }
  reorderChapters(chapterIds: string[]) {
    return this.afterWrite(() => this.online.reorderChapters(chapterIds));
  }
  reorderTopics(chapterId: string, topicIds: string[]) {
    return this.afterWrite(() =>
      this.online.reorderTopics(chapterId, topicIds),
    );
  }
  moveTopic(...args: Parameters<NotesRepository["moveTopic"]>) {
    return this.afterWrite(() => this.online.moveTopic(...args));
  }

  private async cachedChapters(): Promise<Chapter[]> {
    const snapshot = await this.offline.get(this.moduleId);
    if (!snapshot) throw new Error("Ten moduł nie jest dostępny offline.");
    const topicsByChapter = new Map<string, Topic[]>();
    for (const topic of snapshot.topics) {
      const topics = topicsByChapter.get(topic.chapterId) ?? [];
      topics.push({ ...topic, contentLoaded: true });
      topicsByChapter.set(topic.chapterId, topics);
    }
    return snapshot.chapters.map((chapter) => {
      const topics = topicsByChapter.get(chapter.id) ?? [];
      return {
        ...chapter,
        topics,
        topicsStatus: "loaded" as const,
        topicsCount: topics.length,
        completedTopicsCount: topics.filter((topic) => topic.completed).length,
        firstIncompleteTopicId:
          topics.find((topic) => !topic.completed)?.id ?? null,
        firstIncompleteTopicSlug:
          topics.find((topic) => !topic.completed)?.slug ?? null,
      };
    });
  }

  private async withFallback<T>(
    online: () => Promise<T>,
    cached: () => Promise<T>,
  ) {
    try {
      return await online();
    } catch (error) {
      try {
        return await cached();
      } catch {
        throw error;
      }
    }
  }

  private async afterWrite(write: () => Promise<void>) {
    await write();
    void this.offline.syncStored(this.moduleId).catch(() => undefined);
  }
}

function toChapterSummary(chapter: Chapter): Chapter {
  return { ...chapter, topics: [], topicsStatus: "idle" };
}
