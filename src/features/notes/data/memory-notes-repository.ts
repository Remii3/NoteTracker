import { initialChapters } from "./mock-data";
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
    return this.chapters.map(({ id, slug, title, position }) => ({
      id,
      slug,
      title,
      position,
    }));
  }

  async listTopics(chapterId: string) {
    return clone(this.getChapter(chapterId).topics);
  }

  async createChapter(chapter: ChapterSummary) {
    this.chapters.push({ ...clone(chapter), topics: [] });
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

  private getTopic(chapterId: string, topicId: string): Topic {
    const topic = this.getChapter(chapterId).topics.find(
      (item) => item.id === topicId,
    );
    if (!topic) throw new Error("Nie znaleziono tematu.");
    return topic;
  }
}

export const memoryNotesRepository = new MemoryNotesRepository();
