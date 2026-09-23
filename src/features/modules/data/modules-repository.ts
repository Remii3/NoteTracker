import type {
  ContentModuleImportDraft,
  FlashcardModuleImportDraft,
} from "../import/import-model";
import type { NoteContent } from "@/features/notes/types/model";

export type Module = {
  id: string;
  isPinned: boolean;
  slug: string;
  name: string;
  position: number;
  chaptersCount: number;
  completedChaptersCount: number;
  topicsCount: number;
  completedTopicsCount: number;
};

export type ModulePage = {
  modules: Module[];
  hasMore: boolean;
};

export type ModuleExportTopic = {
  id: string;
  title: string;
  completed: boolean;
  position: number;
  content: NoteContent;
};

export type ModuleExportChapter = {
  id: string;
  title: string;
  position: number;
  topics: ModuleExportTopic[];
};

export type ModuleExportData = {
  id: string;
  name: string;
  chapters: ModuleExportChapter[];
};

export interface ModulesRepository {
  list(): Promise<Module[]>;
  listPinned(): Promise<Module[]>;
  listPage(query: string, offset: number, limit: number): Promise<ModulePage>;
  get(id: string): Promise<Module | null>;
  getBySlug(slug: string): Promise<Module | null>;
  getExportData(id: string): Promise<ModuleExportData>;
  create(name: string, position: number): Promise<Module>;
  importDocx(
    draft: ContentModuleImportDraft,
    position: number,
  ): Promise<Module>;
  importFlashcards(
    draft: FlashcardModuleImportDraft,
    position: number,
  ): Promise<Module>;
  rename(id: string, name: string): Promise<void>;
  setPinned(id: string, isPinned: boolean): Promise<void>;
  remove(id: string): Promise<void>;
  reorder(ids: string[]): Promise<void>;
  moveChapter(chapterId: string, moduleId: string): Promise<void>;
}
