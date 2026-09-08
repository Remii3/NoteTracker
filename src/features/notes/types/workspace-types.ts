export type ActiveView =
  "chapters" | "gallery" | "questions" | "statistics" | "notes";

export type ModuleRouteView =
  | "chapters"
  | "chapter"
  | "gallery"
  | "statistics"
  | "questions"
  | "question-history"
  | "study-session";

export type ModuleRouteHandle = {
  moduleView: ModuleRouteView;
  activeView: ActiveView;
  showHeader: boolean;
};

export type SortMode = "manual" | "az" | "za" | "completed" | "incomplete";

export type ManagedItem =
  | {
      kind: "chapter";
      id: string;
      title: string;
      childCount?: number;
      unavailableTitles?: string[];
    }
  | {
      kind: "topic";
      id: string;
      title: string;
      chapterId: string;
      unavailableTitles?: string[];
    };
