import type { QuestionOption } from "./types";

export type QuestionMode = "flashcard" | "test";

export const QUESTION_CONTENT_MAX_LENGTH = 10_000;
export const QUESTION_EXPLANATION_MAX_LENGTH = 20_000;
export const QUESTION_OPTION_MAX_LENGTH = 10_000;
export const QUESTION_OPTION_MAX_COUNT = 20;

export type QuestionFormValue = {
  mode: QuestionMode;
  content: string;
  explanation: string;
  options: QuestionOption[];
};

export function getQuestionMode(options: QuestionOption[]): QuestionMode {
  return options.length >= 2 ? "test" : "flashcard";
}

export function setQuestionOptions(
  value: QuestionFormValue,
  options: QuestionOption[],
): QuestionFormValue {
  return { ...value, mode: getQuestionMode(options), options };
}

export function createQuestionFormValue(input?: {
  content?: string;
  explanation?: string | null;
  options?: QuestionOption[];
}): QuestionFormValue {
  const options = input?.options?.length
    ? input.options.map((option) => ({ ...option }))
    : [{ content: "", isCorrect: true }];
  return {
    mode: getQuestionMode(options),
    content: input?.content ?? "",
    explanation: input?.explanation ?? "",
    options,
  };
}

export function validateQuestionForm(value: QuestionFormValue) {
  if (!value.content.trim()) return "Podaj treść pytania.";
  if (value.content.trim().length > QUESTION_CONTENT_MAX_LENGTH) {
    return `Treść pytania może mieć maksymalnie ${QUESTION_CONTENT_MAX_LENGTH} znaków.`;
  }
  if (value.explanation.trim().length > QUESTION_EXPLANATION_MAX_LENGTH) {
    return `Wyjaśnienie może mieć maksymalnie ${QUESTION_EXPLANATION_MAX_LENGTH} znaków.`;
  }
  if (value.options.length < 1) return "Dodaj przynajmniej jedną odpowiedź.";
  if (value.options.length > QUESTION_OPTION_MAX_COUNT) {
    return `Pytanie może mieć maksymalnie ${QUESTION_OPTION_MAX_COUNT} odpowiedzi.`;
  }
  const normalized = value.options.map((option) => option.content.trim());
  if (normalized.some((option) => !option))
    return "Uzupełnij wszystkie odpowiedzi.";
  if (normalized.some((option) => option.length > QUESTION_OPTION_MAX_LENGTH)) {
    return `Odpowiedź może mieć maksymalnie ${QUESTION_OPTION_MAX_LENGTH} znaków.`;
  }
  if (
    new Set(normalized.map((option) => option.toLocaleLowerCase("pl"))).size !==
    normalized.length
  ) {
    return "Odpowiedzi nie mogą się powtarzać.";
  }
  if (value.options.filter((option) => option.isCorrect).length !== 1) {
    return "Wskaż dokładnie jedną poprawną odpowiedź.";
  }
  return null;
}

export function normalizeQuestionForm(
  value: QuestionFormValue,
): QuestionFormValue {
  const options = value.options.map((option) => ({
    content: option.content.trim(),
    isCorrect: option.isCorrect,
  }));
  return {
    ...value,
    mode: getQuestionMode(options),
    content: value.content.trim(),
    explanation: value.explanation.trim(),
    options,
  };
}
