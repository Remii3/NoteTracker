import { initialChapters } from "./mock-data";
import { selectDashboardSummary } from "../lib/chapter-selectors";
import type {
  ChapterUpdate,
  NotesRepository,
  TopicUpdate,
} from "./notes-repository";
import type {
  Chapter,
  ChapterSummary,
  NoteContent,
  Topic,
  TopicNavigation,
} from "../model/types";

function clone<T>(value: T): T {
  return structuredClone(value);
}

class MemoryNotesRepository implements NotesRepository {
  private chapters = clone(initialChapters);

  getSnapshot() {
    return clone(this.chapters);
  }

  async listChapters() {
    return clone(
      this.chapters.map((chapter) => ({
        ...this.getSummary(chapter),
        topics: [],
        topicsStatus: "idle" as const,
      })),
    );
  }

  async listChapterTopics(chapterId: string) {
    return clone(this.getChapter(chapterId).topics);
  }

  async getTopicContent(chapterId: string, topicId: string) {
    return clone(this.getTopic(chapterId, topicId).content);
  }

  async getTopicNavigation(topicId: string): Promise<TopicNavigation> {
    const topics = this.chapters.flatMap((chapter) =>
      chapter.topics.map((topic) => ({
        chapterId: chapter.id,
        chapterSlug: chapter.slug,
        chapterTitle: chapter.title,
        topicId: topic.id,
        topicSlug: topic.slug,
        topicTitle: topic.title,
      })),
    );
    const currentIndex = topics.findIndex((topic) => topic.topicId === topicId);
    if (currentIndex < 0) throw new Error("Nie znaleziono tematu.");
    return {
      previous: topics[currentIndex - 1] ?? null,
      next: topics[currentIndex + 1] ?? null,
      currentIndex,
      total: topics.length,
    };
  }

  async searchChapters(query: string, limit = 100) {
    const phrase = query.toLocaleLowerCase("pl");
    return clone(
      this.chapters
        .flatMap((chapter) => {
          const topics = chapter.topics.filter((topic) =>
            topic.title.toLocaleLowerCase("pl").includes(phrase),
          );
          return chapter.title.toLocaleLowerCase("pl").includes(phrase) ||
            topics.length
            ? [{ ...chapter, topics }]
            : [];
        })
        .slice(0, limit),
    );
  }

  async getLearningSummary() {
    const summary = selectDashboardSummary(this.chapters);
    return {
      completedChapters: summary.completedChapters,
      completedTopics: summary.completedTopics,
      nextTopic: summary.nextTopic
        ? { chapterId: summary.nextTopic.chapterId, id: summary.nextTopic.id }
        : null,
      totalChapters: this.chapters.length,
      totalTopics: summary.totalTopics,
    };
  }

  async createChapter(chapter: ChapterSummary) {
    this.chapters.push({
      ...clone(chapter),
      topics: [],
      topicsStatus: "loaded",
    });
  }

  async updateChapter(chapterId: string, update: ChapterUpdate) {
    Object.assign(this.getChapter(chapterId), clone(update));
  }

  async deleteChapter(chapterId: string) {
    this.chapters = this.chapters.filter((chapter) => chapter.id !== chapterId);
  }

  async createTopics(chapterId: string, topics: Topic[]) {
    this.getChapter(chapterId).topics.push(...clone(topics));
  }

  async updateTopic(chapterId: string, topicId: string, update: TopicUpdate) {
    Object.assign(this.getTopic(chapterId, topicId), clone(update));
  }

  async updateTopicContent(
    chapterId: string,
    topicId: string,
    content: NoteContent,
  ) {
    this.getTopic(chapterId, topicId).content = clone(content);
  }

  async deleteTopic(chapterId: string, topicId: string) {
    const chapter = this.getChapter(chapterId);
    chapter.topics = chapter.topics.filter((topic) => topic.id !== topicId);
  }

  async deleteItems(chapterIds: string[], topicIds: string[]) {
    const selectedChapters = new Set(chapterIds);
    const selectedTopics = new Set(topicIds);
    this.chapters = this.chapters
      .filter((chapter) => !selectedChapters.has(chapter.id))
      .map((chapter) => ({
        ...chapter,
        topics: chapter.topics.filter((topic) => !selectedTopics.has(topic.id)),
      }));
  }

  async setChapterCompleted(chapterId: string, completed: boolean) {
    const chapter = this.getChapter(chapterId);
    chapter.topics = chapter.topics.map((topic) => ({
      ...topic,
      completed,
    }));
  }

  async reorderChapters(chapterIds: string[]) {
    const byId = new Map(this.chapters.map((chapter) => [chapter.id, chapter]));
    this.chapters = chapterIds.flatMap((id, index) => {
      const chapter = byId.get(id);
      return chapter ? [{ ...chapter, position: (index + 1) * 1000 }] : [];
    });
  }

  async reorderTopics(chapterId: string, topicIds: string[]) {
    const chapter = this.getChapter(chapterId);
    const byId = new Map(chapter.topics.map((topic) => [topic.id, topic]));
    chapter.topics = topicIds.flatMap((id, index) => {
      const topic = byId.get(id);
      return topic ? [{ ...topic, position: (index + 1) * 1000 }] : [];
    });
  }

  async moveTopic(
    topicId: string,
    sourceChapterId: string,
    targetChapterId: string,
    targetSlug: string,
    sourceTopicIds: string[],
    targetTopicIds: string[],
  ) {
    const source = this.getChapter(sourceChapterId);
    const target = this.getChapter(targetChapterId);
    const topic = source.topics.find((item) => item.id === topicId);
    if (!topic) throw new Error("Nie znaleziono przenoszonego tematu.");
    source.topics = source.topics.filter((item) => item.id !== topicId);
    topic.slug = targetSlug;
    target.topics.push(topic);
    await this.reorderTopics(sourceChapterId, sourceTopicIds);
    await this.reorderTopics(targetChapterId, targetTopicIds);
  }

  private getChapter(chapterId: string): Chapter {
    const chapter = this.chapters.find((item) => item.id === chapterId);
    if (!chapter) throw new Error("Nie znaleziono rozdziału.");
    return chapter;
  }

  private getSummary(chapter: Chapter): ChapterSummary {
    const firstIncomplete = chapter.topics.find((topic) => !topic.completed);
    return {
      id: chapter.id,
      slug: chapter.slug,
      title: chapter.title,
      position: chapter.position,
      topicsCount: chapter.topics.length,
      completedTopicsCount: chapter.topics.filter((topic) => topic.completed)
        .length,
      firstIncompleteTopicId: firstIncomplete?.id ?? null,
      firstIncompleteTopicSlug: firstIncomplete?.slug ?? null,
    };
  }

  private getTopic(chapterId: string, topicId: string): Topic {
    const topic = this.getChapter(chapterId).topics.find(
      (item) => item.id === topicId,
    );
    if (!topic) throw new Error("Nie znaleziono tematu.");
    return topic;
  }
}

export const memoryNotesRepository = new MemoryNotesRepository();
