import type { GalleryImage, TopicImage } from "../model/topic-image";
import type { SortMode } from "../model/workspace-types";

export type TopicImageUploadFailure = {
  filename: string;
  message: string;
};

export type TopicImagesUploadResult = {
  uploaded: TopicImage[];
  failed: TopicImageUploadFailure[];
};

export type GalleryImagesPage = {
  images: GalleryImage[];
  hasMore: boolean;
};

export interface TopicImagesService {
  list(topicId: string): Promise<TopicImage[]>;
  listGallery(
    moduleId: string,
    sortMode: SortMode,
    offset: number,
    limit: number,
  ): Promise<GalleryImagesPage>;
  upload(topicId: string, files: File[]): Promise<TopicImagesUploadResult>;
  reorder(topicId: string, imageIds: string[]): Promise<void>;
  remove(imageId: string): Promise<void>;
  removeAll(topicId: string): Promise<void>;
  removeModuleImages(moduleId: string): Promise<void>;
}
