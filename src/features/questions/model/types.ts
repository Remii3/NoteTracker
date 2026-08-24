export type QuestionOption = {
  id?: string;
  content: string;
  isCorrect: boolean;
};
export type Question = {
  id: string;
  chapterId: string | null;
  topicId: string | null;
  chapterTitle?: string | null;
  topicTitle?: string | null;
  content: string;
  explanation: string | null;
  options: QuestionOption[];
};
export type StudyMode = "flashcards" | "test";
export type StudyScope =
  "chapter" | "topic" | "all" | "random_chapters" | "unassigned";
export type StudyResult = "remembered" | "forgotten" | "correct" | "incorrect";
export type StudyItem = {
  id: string;
  position: number;
  question: string;
  options: Required<QuestionOption>[];
  explanation: string | null;
  selectedOptionId: string | null;
  result: StudyResult | null;
};
export type StudySession = {
  id: string;
  mode: StudyMode;
  status: "in_progress" | "completed" | "abandoned";
  configuration: Record<string, unknown>;
  startedAt: string;
  completedAt: string | null;
  items: StudyItem[];
};

export type StudySessionSummary = {
  id: string;
  mode: StudyMode;
  status: StudySession["status"];
  configuration: Record<string, unknown>;
  startedAt: string;
  completedAt: string | null;
  totalCount: number;
  answeredCount: number;
  successfulCount: number;
};
