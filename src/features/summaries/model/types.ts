import type { NoteContent } from "@/features/notes/types/model";

export type SummaryLength = "short" | "standard" | "detailed";

export type GeneratedSummarySection = {
  title: string;
  summary: string;
  keyPoints: string[];
};

export type GeneratedSummary = {
  suggestedTitle: string;
  introduction: string;
  sections: GeneratedSummarySection[];
  connections: string[];
  thingsToRemember: string[];
};

export type SummarySourceTopic = {
  chapterTitle: string;
  topicTitle: string;
};

export type GeneratedSummaryResult = {
  summary: GeneratedSummary;
  sourceTopics: SummarySourceTopic[];
  cached: boolean;
  maxTopics: number;
};

export type SavedSummaryNote = {
  chapterId: string;
  topicId: string;
};

export type SaveSummaryInput = {
  moduleId: string;
  title: string;
  content: NoteContent;
};
