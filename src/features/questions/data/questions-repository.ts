import type {
  Question,
  QuestionOption,
  StudyMode,
  StudyResult,
  StudyScope,
  StudySession,
  StudySessionSummary,
} from "../model/types";

export interface QuestionsRepository {
  getAvailability(filters?: {
    chapterId?: string;
    topicId?: string;
    onlyUnassigned?: boolean;
  }): Promise<{
    flashcardsCount: number;
    testQuestionsCount: number;
  }>;
  list(filters?: {
    topicId?: string;
    chapterId?: string;
    query?: string;
    offset?: number;
    limit?: number;
  }): Promise<{ questions: Question[]; total: number }>;
  save(input: {
    id?: string;
    chapterId: string | null;
    topicId: string | null;
    content: string;
    explanation: string | null;
    options: QuestionOption[];
  }): Promise<string>;
  remove(id: string): Promise<void>;
  createSession(input: {
    mode: StudyMode;
    scope: StudyScope;
    chapterId?: string;
    topicId?: string;
    randomChapterCount: number;
    questionCount: number | null;
  }): Promise<string>;
  listSessions(options?: {
    offset?: number;
    limit?: number;
  }): Promise<{ sessions: StudySessionSummary[]; total: number }>;
  getSession(id: string): Promise<StudySession>;
  answerItem(
    id: string,
    result: StudyResult,
    selectedOptionId?: string,
  ): Promise<void>;
  completeSession(id: string): Promise<void>;
  abandonSession(id: string): Promise<void>;
}
