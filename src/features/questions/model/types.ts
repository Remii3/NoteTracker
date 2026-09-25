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
export type GeneratedQuestionProposal = {
  id: string;
  topicId: string;
  chapterId: string;
  chapterTitle: string;
  topicTitle: string;
  content: string;
  explanation: string;
  options: QuestionOption[];
};
export type GeneratedTopicQuestions = {
  topicId: string;
  topicTitle: string;
  chapterId: string;
  chapterTitle: string;
  cached: boolean;
  questions: GeneratedQuestionProposal[];
};
export type StudyMode = "flashcards" | "test";
export type StudyScope =
  "chapter" | "topic" | "all" | "random_chapters" | "unassigned";
export type StudyResult = "remembered" | "forgotten" | "correct" | "incorrect";
export type FsrsRating = 1 | 2 | 3 | 4;
export type FsrsStateName = "new" | "learning" | "review" | "relearning";
export type QuestionLearningStatus =
  "new" | "learning" | "mastered" | "overdue";
export type FsrsCardState = {
  dueAt: string;
  lastReviewedAt: string | null;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  repetitions: number;
  lapses: number;
  state: FsrsStateName;
  learningStatus: QuestionLearningStatus;
  version: number;
};
export type FsrsProfile = {
  desiredRetention: number;
  parameters: number[] | null;
  parametersVersion: number;
};
export type StudyItem = {
  id: string;
  questionId: string;
  position: number;
  question: string;
  options: Required<QuestionOption>[];
  explanation: string | null;
  selectedOptionId: string | null;
  result: StudyResult | null;
  activeDurationSeconds: number;
  fsrs: FsrsCardState;
};
export type StudySession = {
  id: string;
  mode: StudyMode;
  status: "in_progress" | "completed" | "abandoned";
  configuration: Record<string, unknown>;
  startedAt: string;
  completedAt: string | null;
  items: StudyItem[];
  fsrsProfile: FsrsProfile;
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
