import { createContext, useContext, type ComponentProps } from "react";

import type { QuestionsRepository } from "@/features/questions/data/questions-repository";
import type { StatisticsRepository } from "@/features/statistics/data/statistics-repository";
import type { TopicImagesService } from "../data/topic-images-service";
import type { Chapter, LearningSummary, Topic } from "../types/model";
import type { SortMode } from "../types/workspace-types";
import type { ChapterWorkspace } from "./chapter-workspace";
import type { ContentModuleImportDraft } from "@/features/modules/import/import-model";

export type ModuleContextValue = {
  moduleId: string;
  chapters: Chapter[];
  orderedChapters: Chapter[];
  learningSummary: LearningSummary | null;
  userName?: string;
  moduleName?: string;
  sortMode: SortMode;
  imagesService?: TopicImagesService;
  questionsRepository?: QuestionsRepository;
  statisticsRepository?: StatisticsRepository;
  statisticsCacheScope?: string;
  loadChapterTopics: (chapterId: string) => Promise<Topic[] | null>;
  importDocx: (draft: ContentModuleImportDraft) => Promise<number>;
  openChapter: (chapterId: string, topicId: string) => Promise<void>;
  openChapters: () => void;
  navigateHome: () => void;
  navigateQuestions: () => void;
  navigateQuestionHistory: () => void;
  navigateStudySession: (mode: string, id: string) => void;
  chapterWorkspaceProps: ComponentProps<typeof ChapterWorkspace>;
};

export const ModuleContext = createContext<ModuleContextValue | null>(null);

export function useModuleContext() {
  const context = useContext(ModuleContext);
  if (!context) {
    throw new Error("useModuleContext must be used inside ModuleProvider");
  }
  return context;
}
