// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { parseImportedHtml } from "./docx-import";

describe("parseImportedHtml", () => {
  it("maps manual decimal numbering to chapters, topics and topic content", () => {
    const result = parseImportedHtml(
      "Biologia",
      [
        "<p>1 Komórka</p>",
        "<p>1.1 Budowa komórki</p>",
        "<p><strong>Ważna</strong> treść.</p>",
        "<p>1.1.1 Organella</p>",
        "<p>Opis organelli.</p>",
      ].join(""),
    );

    expect(result).toMatchObject({ kind: "content", source: "docx" });
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].title).toBe("Komórka");
    expect(result.chapters[0].topics[0].title).toBe("Budowa komórki");
    expect(result.chapters[0].topics[0].content).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Ważna", marks: [{ type: "bold" }] },
            { type: "text", text: " treść." },
          ],
        },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Organella" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Opis organelli." }],
        },
      ],
    });
  });

  it("maps Word heading levels and keeps images, links and tables", () => {
    const result = parseImportedHtml(
      "Chemia",
      [
        "<h1>Atomy</h1>",
        "<h2>Wiązania</h2>",
        '<p><a href="https://example.com">Źródło</a><img src="data:image/png;base64,abc" alt="Schemat"></p>',
        "<table><tr><th>Nazwa</th><td>Jonowe</td></tr></table>",
      ].join(""),
    );

    const content = result.chapters[0].topics[0].content.content ?? [];
    expect(content[0].content?.[0].marks?.[0]).toMatchObject({
      type: "link",
      attrs: { href: "https://example.com" },
    });
    expect(content[0].content?.[1]).toMatchObject({
      type: "image",
      attrs: { src: "data:image/png;base64,abc", alt: "Schemat" },
    });
    expect(content[1]).toMatchObject({ type: "table" });
  });

  it("adds numeric suffixes to duplicate titles", () => {
    const result = parseImportedHtml(
      "Fizyka",
      "<p>1 Ruch</p><p>1.1 Prędkość</p><p>2 Ruch</p><p>2.1 Prędkość</p><p>2.2 Prędkość</p>",
    );

    expect(result.chapters.map((chapter) => chapter.title)).toEqual([
      "Ruch",
      "Ruch (2)",
    ]);
    expect(result.chapters[1].topics.map((topic) => topic.title)).toEqual([
      "Prędkość",
      "Prędkość (2)",
    ]);
  });

  it("rejects a document without the required structure", () => {
    expect(() => parseImportedHtml("Dokument", "<p>Zwykły tekst</p>")).toThrow(
      "Nie znaleziono rozdziałów",
    );
  });

  it("drops unsafe links from imported content", () => {
    const result = parseImportedHtml(
      "Dokument",
      '<h1>Rozdział</h1><h2>Temat</h2><p><a href="javascript:alert(1)">Tekst</a></p>',
    );

    expect(
      result.chapters[0].topics[0].content.content?.[0].content?.[0].marks,
    ).toBeUndefined();
  });
});
