import type {
  Question,
  QuestionOption,
  StudyMode,
  FsrsRating,
  StudyScope,
  StudySession,
  StudySessionSummary,
} from "../model/types";
import type { QuestionModuleImportDraft } from "@/features/modules/import/import-model";

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
  getDuplicateStatus(input: {
    id?: string;
    content: string;
    options: QuestionOption[];
  }): Promise<{ kind: "exact" | "same_content"; questionId: string } | null>;
  remove(id: string): Promise<void>;
  importQuestions(draft: QuestionModuleImportDraft): Promise<number>;
  createSession(input: {
    mode: StudyMode;
    scope: StudyScope;
    chapterId?: string;
    topicId?: string;
    randomChapterCount: number;
    questionCount: number | null;
    hideFlashcardOptions: boolean;
  }): Promise<string>;
  listSessions(options?: {
    offset?: number;
    limit?: number;
  }): Promise<{ sessions: StudySessionSummary[]; total: number }>;
  getSession(id: string): Promise<StudySession>;
  answerItem(
    id: string,
    rating: FsrsRating,
    selectedOptionId?: string,
    activeDurationSeconds?: number,
  ): Promise<void>;
  completeSession(id: string): Promise<void>;
  abandonSession(id: string): Promise<void>;
}
