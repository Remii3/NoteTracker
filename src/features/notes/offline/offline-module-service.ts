import type { Module } from "@/features/modules/data/modules-repository";
import type { NotesRepository } from "../data/notes-repository";
import type { TopicImagesService } from "../data/topic-images-service";
import type { NoteContent } from "../types/model";
import {
  listOfflineModuleImages,
  listOfflineModules,
  offlineModuleKey,
  readOfflineModule,
  removeOfflineModule,
  removeOfflineModuleImages,
  replaceOfflineImages,
  writeOfflineModule,
} from "./offline-storage";
import type {
  OfflineImageRecord,
  OfflineModuleSnapshot,
} from "./offline-types";

type RepositoryFactory = (moduleId: string) => NotesRepository;

export class OfflineModuleService {
  private readonly userId: string;
  private readonly repositoryForModule: RepositoryFactory;
  private readonly imagesService?: TopicImagesService;

  constructor(
    userId: string,
    repositoryForModule: RepositoryFactory,
    imagesService?: TopicImagesService,
  ) {
    this.userId = userId;
    this.repositoryForModule = repositoryForModule;
    this.imagesService = imagesService;
  }

  list() {
    return listOfflineModules(this.userId);
  }

  get(moduleId: string) {
    return readOfflineModule(this.userId, moduleId);
  }

  async find(idOrSlug: string) {
    const modules = await this.list();
    return modules.find(
      (snapshot) =>
        snapshot.module.id === idOrSlug || snapshot.module.slug === idOrSlug,
    );
  }

  remove(moduleId: string) {
    return removeOfflineModule(this.userId, moduleId);
  }

  async syncStored(moduleId: string) {
    const snapshot = await this.get(moduleId);
    if (!snapshot) return undefined;
    return this.sync(snapshot.module, snapshot.includesImages);
  }

  async sync(module: Module, includeImages: boolean) {
    const current = await this.get(module.id);
    const repository = this.repositoryForModule(module.id);
    const changes = await repository.getOfflineChanges(
      current?.syncedAt,
      includeImages,
    );

    const activeChapterIds = new Set(changes.activeChapterIds);
    const activeTopicIds = new Set(changes.activeTopicIds);
    const chapters = new Map(
      (current?.chapters ?? [])
        .filter((chapter) => activeChapterIds.has(chapter.id))
        .map((chapter) => [chapter.id, chapter]),
    );
    const topics = new Map(
      (current?.topics ?? [])
        .filter((topic) => activeTopicIds.has(topic.id))
        .map((topic) => [topic.id, topic]),
    );
    for (const chapter of changes.chapters) chapters.set(chapter.id, chapter);
    for (const topic of changes.topics) topics.set(topic.id, topic);

    const chapterRows = [...chapters.values()].sort(comparePosition);
    const topicRows = [...topics.values()].sort(comparePosition);
    const completedTopics = topicRows.filter((topic) => topic.completed);
    const completedChapterIds = new Set(
      chapterRows.flatMap((chapter) => {
        const children = topicRows.filter(
          (topic) => topic.chapterId === chapter.id,
        );
        return children.length && children.every((topic) => topic.completed)
          ? [chapter.id]
          : [];
      }),
    );
    const nextModule: Module = {
      ...module,
      ...changes.module,
      chaptersCount: chapterRows.length,
      completedChaptersCount: completedChapterIds.size,
      topicsCount: topicRows.length,
      completedTopicsCount: completedTopics.length,
    };

    if (includeImages) await this.syncImages(module.id, changes.images);
    else if (current?.includesImages)
      await removeOfflineModuleImages(this.userId, module.id);

    const snapshot: OfflineModuleSnapshot = {
      key: offlineModuleKey(this.userId, module.id),
      userId: this.userId,
      module: nextModule,
      chapters: chapterRows,
      topics: topicRows,
      syncedAt: changes.serverTime,
      includesImages: includeImages,
    };
    await writeOfflineModule(snapshot);
    if (typeof navigator !== "undefined" && navigator.storage?.persist)
      void navigator.storage.persist().catch(() => false);
    return snapshot;
  }

  async updateTopicContent(
    moduleId: string,
    topicId: string,
    content: NoteContent,
  ) {
    const snapshot = await this.get(moduleId);
    if (!snapshot) return;
    const topic = snapshot.topics.find((item) => item.id === topicId);
    if (!topic) return;
    await writeOfflineModule({
      ...snapshot,
      topics: snapshot.topics.map((item) =>
        item.id === topicId ? { ...item, content } : item,
      ),
    });
  }

  private async syncImages(
    moduleId: string,
    metadata: Awaited<
      ReturnType<NotesRepository["getOfflineChanges"]>
    >["images"],
  ) {
    if (!this.imagesService?.download && metadata.length)
      throw new Error("Pobieranie zdjęć offline nie jest skonfigurowane.");
    const existing = await listOfflineModuleImages(this.userId, moduleId);
    const existingById = new Map(
      existing.map((record) => [record.metadata.id, record]),
    );
    const changed = metadata.filter((image) => {
      const cached = existingById.get(image.id);
      return !cached || cached.metadata.updatedAt !== image.updatedAt;
    });
    const downloaded: OfflineImageRecord[] = changed.flatMap((image) => {
      const cached = existingById.get(image.id);
      return cached && cached.metadata.storageKey === image.storageKey
        ? [{ ...cached, metadata: image }]
        : [];
    });
    const missingBlobs = changed.filter((image) => {
      const cached = existingById.get(image.id);
      return !cached || cached.metadata.storageKey !== image.storageKey;
    });
    for (let index = 0; index < missingBlobs.length; index += 4) {
      const batch = await Promise.all(
        missingBlobs.slice(index, index + 4).map(async (image) => ({
          key: `${this.userId}:${image.id}`,
          userId: this.userId,
          moduleId,
          topicId: image.topicId,
          metadata: image,
          blob: await this.imagesService!.download!(image.id),
        })),
      );
      downloaded.push(...batch);
    }
    await replaceOfflineImages(
      this.userId,
      moduleId,
      downloaded,
      new Set(metadata.map((image) => image.id)),
    );
  }
}

function comparePosition(
  first: { position: number; id: string },
  second: { position: number; id: string },
) {
  return first.position - second.position || first.id.localeCompare(second.id);
}
