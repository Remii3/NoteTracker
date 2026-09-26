import { describe, expect, it } from "vitest";

import { summaryToNoteContent, summaryToPlainText } from "./summary-content";

const summary = {
  suggestedTitle: "Streszczenie",
  introduction: "Wprowadzenie",
  sections: [
    {
      title: "Sekcja",
      summary: "Opis sekcji",
      keyPoints: ["Punkt pierwszy"],
    },
  ],
  connections: ["Powiązanie"],
  thingsToRemember: ["Zapamiętaj"],
};

const sources = [{ chapterTitle: "Rozdział", topicTitle: "Temat" }];

describe("summary content", () => {
  it("creates TipTap note content with headings, lists and sources", () => {
    const content = summaryToNoteContent(summary, sources);

    expect(content.type).toBe("doc");
    expect(content.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "heading",
          attrs: { level: 2 },
        }),
        expect.objectContaining({ type: "bulletList" }),
      ]),
    );
    expect(JSON.stringify(content)).toContain("Rozdział — Temat");
  });

  it("creates copyable plain text", () => {
    const text = summaryToPlainText("Moje streszczenie", summary, sources);

    expect(text).toContain("Moje streszczenie");
    expect(text).toContain("• Punkt pierwszy");
    expect(text).toContain("Źródła: Rozdział — Temat");
  });
});
