import type {
  Flashcard,
  FlashcardMode,
  FlashcardResult,
  FlashcardSession,
} from "../model/types";

export interface FlashcardsRepository {
  listForTopic(topicId: string): Promise<Flashcard[]>;
  create(topicId: string, question: string, answer: string): Promise<Flashcard>;
  update(id: string, question: string, answer: string): Promise<void>;
  remove(id: string): Promise<void>;
  createSession(options: {
    mode: FlashcardMode;
    chapterId?: string;
    randomChapterCount: number;
    cardCount: number | null;
  }): Promise<string>;
  getSession(id: string): Promise<FlashcardSession>;
  answerItem(id: string, result: FlashcardResult): Promise<void>;
  completeSession(id: string): Promise<void>;
  retrySession(id: string): Promise<string>;
}
