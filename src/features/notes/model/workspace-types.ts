export type ActiveView = "home" | "notes";

export type SortMode = "manual" | "az" | "za" | "completed" | "incomplete";

export type StudyTopic = {
  chapterId: string;
  chapterTitle: string;
  topicId: string;
  topicTitle: string;
};

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
