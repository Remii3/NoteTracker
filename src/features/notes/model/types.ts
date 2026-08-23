export type NoteContent = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: NoteContent[];
  marks?: Array<{
    type: string;
    attrs?: Record<string, unknown>;
  }>;
  text?: string;
};

export type Topic = {
  id: string;
  contentLoaded?: boolean;
  slug: string;
  title: string;
  content: NoteContent;
  completed: boolean;
  position: number;
};

export type ChapterSummary = {
  id: string;
  slug: string;
  title: string;
  position: number;
};

export type Chapter = ChapterSummary & {
  topics: Topic[];
};

export type LearningSummary = {
  completedChapters: number;
  completedTopics: number;
  nextTopic: { chapterId: string; id: string } | null;
  totalChapters: number;
  totalTopics: number;
};
