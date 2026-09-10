export type Module = {
  id: string;
  slug: string;
  name: string;
  position: number;
  chaptersCount: number;
  completedChaptersCount: number;
  topicsCount: number;
  completedTopicsCount: number;
};

export interface ModulesRepository {
  list(): Promise<Module[]>;
  get(id: string): Promise<Module | null>;
  getBySlug(slug: string): Promise<Module | null>;
  create(name: string, position: number): Promise<Module>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  reorder(ids: string[]): Promise<void>;
  moveChapter(chapterId: string, moduleId: string): Promise<void>;
}
