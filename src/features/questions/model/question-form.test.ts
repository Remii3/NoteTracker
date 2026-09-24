import { describe, expect, it } from "vitest";

import {
  createQuestionFormValue,
  normalizeQuestionForm,
  setQuestionOptions,
  validateQuestionForm,
} from "./question-form";

describe("question form", () => {
  it("creates a flashcard by default and a test from multiple options", () => {
    expect(createQuestionFormValue().mode).toBe("flashcard");
    expect(
      createQuestionFormValue({
        content: "Pytanie",
        options: [
          { content: "A", isCorrect: true },
          { content: "B", isCorrect: false },
        ],
      }).mode,
    ).toBe("test");
  });

  it("derives availability from the number of answers without discarding them", () => {
    const flashcard = createQuestionFormValue({
      content: "Pytanie",
      options: [{ content: "A", isCorrect: true }],
    });
    const test = setQuestionOptions(flashcard, [
      { content: "A", isCorrect: true },
      { content: "B", isCorrect: false },
      { content: "C", isCorrect: false },
    ]);

    expect(test.mode).toBe("test");
    expect(test.options).toEqual([
      { content: "A", isCorrect: true },
      { content: "B", isCorrect: false },
      { content: "C", isCorrect: false },
    ]);
    const backToFlashcard = setQuestionOptions(test, [test.options[0]]);
    expect(backToFlashcard.mode).toBe("flashcard");
    expect(backToFlashcard.options).toEqual([
      { content: "A", isCorrect: true },
    ]);
  });

  it("validates answer count, uniqueness and the correct answer", () => {
    const form = createQuestionFormValue({
      content: "Pytanie",
      options: [
        { content: "Ta sama", isCorrect: true },
        { content: " ta sama ", isCorrect: false },
      ],
    });

    expect(validateQuestionForm(form)).toBe(
      "Odpowiedzi nie mogą się powtarzać.",
    );
    expect(
      validateQuestionForm({
        ...form,
        options: [
          { content: "A", isCorrect: false },
          { content: "B", isCorrect: false },
        ],
      }),
    ).toBe("Wskaż dokładnie jedną poprawną odpowiedź.");
  });

  it("trims values and removes temporary retained options", () => {
    const normalized = normalizeQuestionForm({
      mode: "flashcard",
      content: "  Pytanie  ",
      explanation: "  Wyjaśnienie  ",
      options: [{ content: "  Odpowiedź  ", isCorrect: true }],
    });

    expect(normalized).toEqual({
      mode: "flashcard",
      content: "Pytanie",
      explanation: "Wyjaśnienie",
      options: [{ content: "Odpowiedź", isCorrect: true }],
    });
  });
});
