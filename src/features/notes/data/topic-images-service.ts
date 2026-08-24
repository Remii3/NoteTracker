import type { TopicImage } from "../model/topic-image";

export interface TopicImagesService {
  list(topicId: string): Promise<TopicImage[]>;
  upload(topicId: string, files: File[]): Promise<TopicImage[]>;
  remove(imageId: string): Promise<void>;
  removeAll(topicId: string): Promise<void>;
}
