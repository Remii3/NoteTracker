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
      kind: "questions",
      source: "quizlet",
      name: "Biologia",
      questions: [
        {
          mode: "flashcard",
          content: "Mitochondrium",
          options: [{ content: "Elektrownia komórki", isCorrect: true }],
        },
        {
          mode: "flashcard",
          content: "Jądro",
          options: [{ content: "Przechowuje DNA", isCorrect: true }],
        },
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
    expect(result.questions).toEqual([
      {
        mode: "flashcard",
        content: "Definicja",
        explanation: "",
        options: [{ content: "A, B", isCorrect: true }],
      },
      {
        mode: "flashcard",
        content: "Druga, definicja",
        explanation: "",
        options: [{ content: "C", isCorrect: true }],
      },
    ]);
  });

  it("supports a spaced dash and warns about invalid and duplicate rows", () => {
    const result = parseQuizletText(
      "ATP - nośnik energii\nbłędny wiersz\nATP - nośnik energii",
      "Biochemia",
      [],
      { termSeparator: "dash", rowSeparator: "newline", swapSides: false },
    );

    expect(result.questions).toHaveLength(2);
    expect(result.warnings).toEqual([
      "Pominięto 1 niepełny wiersz.",
      "Wykryto 1 powtórzoną fiszkę; zostaną zaimportowane.",
    ]);
  });

  it("keeps multiline questions together when the answer is separated by a tab", () => {
    const result = parseQuizletText(
      [
        "Zgodnie z KPC, jeżeli powód dochodzi kilku roszczeń, obliczając wartość:",
        "a) nie zlicza się ich wartości,",
        "b) przyjmuje się najwyższą wartość,",
        "c) zlicza się ich wartość.\tC. zlicza się ich wartość",
        "Zgodnie z KPC, o wartości przedmiotu zastawu rozstrzyga:",
        "a) wartość wierzytelności,",
        "b) wartość przedmiotu zastawu,",
        "c) różnica wartości.\tB. wartość przedmiotu zastawu",
      ].join("\n"),
      "KPC",
      [],
    );

    expect(result.questions).toEqual([
      {
        mode: "flashcard",
        content: [
          "Zgodnie z KPC, jeżeli powód dochodzi kilku roszczeń, obliczając wartość:",
          "a) nie zlicza się ich wartości,",
          "b) przyjmuje się najwyższą wartość,",
          "c) zlicza się ich wartość.",
        ].join("\n"),
        explanation: "",
        options: [{ content: "C. zlicza się ich wartość", isCorrect: true }],
      },
      {
        mode: "flashcard",
        content: [
          "Zgodnie z KPC, o wartości przedmiotu zastawu rozstrzyga:",
          "a) wartość wierzytelności,",
          "b) wartość przedmiotu zastawu,",
          "c) różnica wartości.",
        ].join("\n"),
        explanation: "",
        options: [
          { content: "B. wartość przedmiotu zastawu", isCorrect: true },
        ],
      },
    ]);
  });

  it("rejects input without any complete cards", () => {
    expect(() => parseQuizletText("bez separatora", "Zestaw", [])).toThrow(
      "Nie znaleziono poprawnych fiszek",
    );
  });
});
