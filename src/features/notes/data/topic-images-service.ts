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
  total: number;
};

export type GalleryChapterSection = {
  chapterId: string;
  chapterSlug: string;
  chapterTitle: string;
  images: GalleryImage[];
  hasMore: boolean;
  total: number;
};

export interface TopicImagesService {
  list(topicId: string): Promise<TopicImage[]>;
  listGallerySections(
    moduleId: string,
    sortMode: SortMode,
    perChapterLimit: number,
  ): Promise<GalleryChapterSection[]>;
  listChapterGallery(
    moduleId: string,
    chapterId: string,
    offset: number,
    limit: number,
  ): Promise<GalleryImagesPage>;
  upload(topicId: string, files: File[]): Promise<TopicImagesUploadResult>;
  reorder(topicId: string, imageIds: string[]): Promise<void>;
  remove(imageId: string): Promise<void>;
  removeAll(topicId: string): Promise<void>;
  removeModuleImages(moduleId: string): Promise<void>;
}
