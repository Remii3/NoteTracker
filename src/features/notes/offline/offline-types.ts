import type { Module } from "@/features/modules/data/modules-repository";
import type { NoteContent } from "../types/model";

export type OfflineChapterRow = {
  id: string;
  moduleId: string;
  slug: string;
  title: string;
  position: number;
  updatedAt: string;
};

export type OfflineTopicRow = {
  id: string;
  chapterId: string;
  slug: string;
  title: string;
  content: NoteContent;
  completed: boolean;
  position: number;
  updatedAt: string;
};

export type OfflineImageMetadata = {
  id: string;
  topicId: string;
  storageKey: string;
  originalFilename: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  position: number;
  updatedAt: string;
};

export type OfflineModuleChanges = {
  serverTime: string;
  module: Pick<Module, "id" | "slug" | "name" | "isPinned" | "position"> & {
    updatedAt: string;
  };
  chapters: OfflineChapterRow[];
  topics: OfflineTopicRow[];
  activeChapterIds: string[];
  activeTopicIds: string[];
  images: OfflineImageMetadata[];
};

export type OfflineModuleSnapshot = {
  key: string;
  userId: string;
  module: Module;
  chapters: OfflineChapterRow[];
  topics: OfflineTopicRow[];
  syncedAt: string;
  includesImages: boolean;
};

export type OfflineImageRecord = {
  key: string;
  userId: string;
  moduleId: string;
  topicId: string;
  metadata: OfflineImageMetadata;
  blob: Blob;
};
