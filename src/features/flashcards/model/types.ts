export type Flashcard = {
  id: string;
  topicId: string;
  question: string;
  answer: string;
};

export type FlashcardMode = "chapter" | "all" | "random_chapters";
export type FlashcardResult = "remembered" | "forgotten";

export type FlashcardSessionItem = {
  id: string;
  position: number;
  question: string;
  answer: string;
  result: FlashcardResult | null;
};

export type FlashcardSession = {
  id: string;
  status: "in_progress" | "completed" | "abandoned";
  items: FlashcardSessionItem[];
};
