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
  topicsCount: number;
  completedTopicsCount: number;
  firstIncompleteTopicId: string | null;
  firstIncompleteTopicSlug: string | null;
};

export type Chapter = ChapterSummary & {
  topics: Topic[];
  topicsStatus: "idle" | "loading" | "loaded" | "error";
};

export type LearningSummary = {
  completedChapters: number;
  completedTopics: number;
  nextTopic: { chapterId: string; id: string } | null;
  totalChapters: number;
  totalTopics: number;
};

export type TopicNavigationItem = {
  chapterId: string;
  chapterSlug: string;
  chapterTitle: string;
  topicId: string;
  topicSlug: string;
  topicTitle: string;
};

export type TopicNavigation = {
  previous: TopicNavigationItem | null;
  next: TopicNavigationItem | null;
  currentIndex: number;
  total: number;
};
