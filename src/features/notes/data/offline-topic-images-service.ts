import type { OfflineModuleService } from "../offline/offline-module-service";
import { readOfflineTopicImages } from "../offline/offline-storage";
import type {
  GalleryImagesPage,
  GallerySectionsPage,
  TopicImagesService,
} from "./topic-images-service";

export class OfflineTopicImagesService implements TopicImagesService {
  private readonly online: TopicImagesService;
  private readonly userId: string;
  private readonly offline: OfflineModuleService;
  private readonly moduleId: string;

  constructor(
    online: TopicImagesService,
    userId: string,
    offline: OfflineModuleService,
    moduleId: string,
  ) {
    this.online = online;
    this.userId = userId;
    this.offline = offline;
    this.moduleId = moduleId;
  }

  download(imageId: string) {
    if (!this.online.download)
      throw new Error("Pobieranie zdjęć nie jest skonfigurowane.");
    return this.online.download(imageId);
  }

  async list(topicId: string) {
    try {
      return await this.online.list(topicId);
    } catch (error) {
      const [records, snapshot] = await Promise.all([
        readOfflineTopicImages(this.userId, topicId),
        this.offline.get(this.moduleId),
      ]);
      if (!snapshot?.includesImages) throw error;
      return records
        .sort(
          (first, second) =>
            first.metadata.position - second.metadata.position ||
            first.metadata.id.localeCompare(second.metadata.id),
        )
        .map((record) => ({
          ...record.metadata,
          url: URL.createObjectURL(record.blob),
        }));
    }
  }

  listGallerySections(
    ...args: Parameters<TopicImagesService["listGallerySections"]>
  ): Promise<GallerySectionsPage> {
    return this.online.listGallerySections(...args);
  }
  listChapterGallery(
    ...args: Parameters<TopicImagesService["listChapterGallery"]>
  ): Promise<GalleryImagesPage> {
    return this.online.listChapterGallery(...args);
  }
  upload(...args: Parameters<TopicImagesService["upload"]>) {
    return this.online.upload(...args).then((result) => {
      void this.offline.syncStored(this.moduleId).catch(() => undefined);
      return result;
    });
  }
  reorder(...args: Parameters<TopicImagesService["reorder"]>) {
    return this.online.reorder(...args).then(() => {
      void this.offline.syncStored(this.moduleId).catch(() => undefined);
    });
  }
  remove(...args: Parameters<TopicImagesService["remove"]>) {
    return this.online.remove(...args).then(() => {
      void this.offline.syncStored(this.moduleId).catch(() => undefined);
    });
  }
}
