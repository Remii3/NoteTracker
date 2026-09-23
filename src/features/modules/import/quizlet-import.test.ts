import { describe, expect, it } from "vitest";

import { parseQuizletText } from "./quizlet-import";

describe("parseQuizletText", () => {
  it("detects tab-separated Quizlet exports", () => {
    const result = parseQuizletText(
      "Mitochondrium\tElektrownia komórki\nJądro\tPrzechowuje DNA",
      "Biologia",
      [],
    );

    expect(result).toMatchObject({
      kind: "flashcards",
      source: "quizlet",
      name: "Biologia",
      cards: [
        { front: "Mitochondrium", back: "Elektrownia komórki" },
        { front: "Jądro", back: "Przechowuje DNA" },
      ],
    });
  });

  it("supports semicolon rows, commas, quoted fields and swapping sides", () => {
    const result = parseQuizletText(
      '"A, B",Definicja;C,"Druga, definicja"',
      "Zestaw",
      ["Zestaw"],
      { termSeparator: "comma", rowSeparator: "semicolon", swapSides: true },
    );

    expect(result.name).toBe("Zestaw (2)");
    expect(result.cards).toEqual([
      { front: "Definicja", back: "A, B" },
      { front: "Druga, definicja", back: "C" },
    ]);
  });

  it("supports a spaced dash and warns about invalid and duplicate rows", () => {
    const result = parseQuizletText(
      "ATP - nośnik energii\nbłędny wiersz\nATP - nośnik energii",
      "Biochemia",
      [],
      { termSeparator: "dash", rowSeparator: "newline", swapSides: false },
    );

    expect(result.cards).toHaveLength(2);
    expect(result.warnings).toEqual([
      "Pominięto 1 niepełny wiersz.",
      "Wykryto 1 powtórzoną fiszkę; zostaną zaimportowane.",
    ]);
  });

  it("rejects input without any complete cards", () => {
    expect(() => parseQuizletText("bez separatora", "Zestaw", [])).toThrow(
      "Nie znaleziono poprawnych fiszek",
    );
  });
});
