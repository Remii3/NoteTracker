export type TopicImage = {
  id: string;
  topicId: string;
  storageKey: string;
  originalFilename: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  position: number;
  url: string;
};

export type GalleryImage = TopicImage & {
  chapterId: string;
  chapterSlug: string;
  chapterTitle: string;
  topicSlug: string;
  topicTitle: string;
};
