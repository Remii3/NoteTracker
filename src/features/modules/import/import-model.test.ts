import { expect, it } from "vitest";

import {
  createQuestionImportPayload,
  normalizeContentImportDraft,
  type ContentModuleImportDraft,
  type QuestionModuleImportDraft,
} from "./import-model";

it("normalizes module, chapter and topic names independently of the source parser", () => {
  const draft: ContentModuleImportDraft = {
    kind: "content",
    source: "docx",
    name: "  Biologia   komórki  ",
    warnings: [],
    chapters: [
      {
        title: " Komórka ",
        topics: [
          {
            title: " Budowa ",
            content: { type: "doc", content: [{ type: "paragraph" }] },
          },
          {
            title: "budowa",
            content: { type: "doc", content: [{ type: "paragraph" }] },
          },
        ],
      },
      { title: "komórka", topics: [] },
    ],
  };

  const normalized = normalizeContentImportDraft(draft);

  expect(normalized.name).toBe("Biologia komórki");
  expect(normalized.chapters.map((chapter) => chapter.title)).toEqual([
    "Komórka",
    "komórka (2)",
  ]);
  expect(normalized.chapters[0].topics.map((topic) => topic.title)).toEqual([
    "Budowa",
    "budowa (2)",
  ]);
});

it("creates chapter and topic payload fields for Anki deck hierarchy", () => {
  const draft: QuestionModuleImportDraft = {
    kind: "questions",
    source: "anki",
    name: "Biologia",
    warnings: [],
    questions: [
      {
        mode: "flashcard",
        content: "Mitochondrium",
        explanation: "",
        options: [{ content: "Elektrownia komórki", isCorrect: true }],
        chapterTitle: " Biologia człowieka ",
        topicTitle: " Komórka / Organella ",
      },
    ],
  };

  expect(createQuestionImportPayload(draft)[0]).toMatchObject({
    chapterTitle: "Biologia człowieka",
    chapterSlug: "biologia-czlowieka",
    topicTitle: "Komórka / Organella",
    topicSlug: "komorka-organella",
  });
});
