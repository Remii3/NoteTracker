export type ActiveView = "home" | "chapters" | "questions" | "notes";

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
