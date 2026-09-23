import { expect, it } from "vitest";

import {
  normalizeContentImportDraft,
  type ContentModuleImportDraft,
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
