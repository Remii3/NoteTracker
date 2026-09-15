import type { ImportedModuleDraft } from "../import/docx-import";

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

export interface ModulesRepository {
  list(): Promise<Module[]>;
  listPinned(): Promise<Module[]>;
  listPage(query: string, offset: number, limit: number): Promise<ModulePage>;
  get(id: string): Promise<Module | null>;
  getBySlug(slug: string): Promise<Module | null>;
  create(name: string, position: number): Promise<Module>;
  importDocx(draft: ImportedModuleDraft, position: number): Promise<Module>;
  rename(id: string, name: string): Promise<void>;
  setPinned(id: string, isPinned: boolean): Promise<void>;
  remove(id: string): Promise<void>;
  reorder(ids: string[]): Promise<void>;
  moveChapter(chapterId: string, moduleId: string): Promise<void>;
}
