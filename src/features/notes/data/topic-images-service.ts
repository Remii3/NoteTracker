import type { TopicImage } from "../model/topic-image";

export type TopicImageUploadFailure = {
  filename: string;
  message: string;
};

export type TopicImagesUploadResult = {
  uploaded: TopicImage[];
  failed: TopicImageUploadFailure[];
};

export interface TopicImagesService {
  list(topicId: string): Promise<TopicImage[]>;
  upload(topicId: string, files: File[]): Promise<TopicImagesUploadResult>;
  reorder(topicId: string, imageIds: string[]): Promise<void>;
  remove(imageId: string): Promise<void>;
  removeAll(topicId: string): Promise<void>;
}
