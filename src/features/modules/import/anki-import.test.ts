import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { decompress } from "fzstd";

import { parseAnkiPackage, parseAnkiText } from "./anki-import";

const ZSTD_COLLECTION = Uint8Array.from(
  Buffer.from(
    "KLUv/QRY/QcAYk83M2Br0wEwDIMeE0AALATBBh+dRqyzrfq7rbeptruGh7bD+pzMRFg2rForl2GocLQ1/0nbKR0dGCVWMfBBEiXtm0FMDrmBvlRUcmN13obVQbJtctKely+dAat9r7GK2UjfS6g0jSVvW2NVUo7Ohoe83ptUmsY9aU/qQHPIQ22ij+ib6LGsC8q3Ur4Y8XIGWhY2yOLkzPYlLYZttIiXSoaSgHmqMFAonijKJNHwZOKtNFoVfQE0TpKkiKM4Jzoncv8DCjQQDt0d8t/9+Q/9Z164cxe4At++bLVwvLISMREKAE73HyEYoKHmwHN+Hkpp81SUNrA58AFwDWyYDZABXgI30A==",
    "base64",
  ),
);

describe("parseAnkiText", () => {
  it("imports tab-separated Anki notes and derives the module name", () => {
    const result = parseAnkiText(
      "Mitochondrium\tElektrownia komórki\nJądro\tPrzechowuje DNA",
      "Biologia.txt",
      ["Biologia"],
    );

    expect(result).toMatchObject({
      kind: "questions",
      source: "anki",
      name: "Biologia (2)",
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

  it("uses Anki headers, skips special columns and cleans HTML", () => {
    const result = parseAnkiText(
      [
        "#separator:Semicolon",
        "#html:true",
        "#tags column:3",
        '"<b>ATP</b>";"Nośnik<br>energii";biochemia',
      ].join("\n"),
      "Biochemia.csv",
      [],
    );

    expect(result.questions[0]).toMatchObject({
      mode: "flashcard",
      content: "ATP",
      options: [{ content: "Nośnik\nenergii", isCorrect: true }],
    });
    expect(result.warnings).toContain(
      "Formatowanie HTML zostało zamienione na zwykły tekst.",
    );
  });

  it("supports quoted multiline fields and warns about extra fields", () => {
    const result = parseAnkiText(
      'Pytanie,"Odpowiedź\nw dwóch liniach",dodatkowe',
      "Zestaw.csv",
      [],
    );

    expect(result.questions[0]).toEqual({
      mode: "flashcard",
      content: "Pytanie",
      explanation: "",
      options: [{ content: "Odpowiedź\nw dwóch liniach", isCorrect: true }],
    });
    expect(result.warnings).toContain(
      "Notatki mają więcej niż dwa pola; zaimportowano pierwsze dwa pola każdej notatki.",
    );
  });

  it("recognizes test questions with arbitrary letter labels on separate lines", () => {
    const result = parseAnkiText(
      '"Kodeks postępowania administracyjnego normuje postępowanie:\nd) spory o właściwość\nf) skargi do sądu\na) podatki"\t"Prawidłowa odpowiedź: A\n\nPodstawa prawna:\nArt. 1 pkt 3 KPA"',
      "Prawo.txt",
      [],
    );

    expect(result.questions[0]).toEqual({
      mode: "test",
      content: "Kodeks postępowania administracyjnego normuje postępowanie:",
      explanation: "Podstawa prawna:\nArt. 1 pkt 3 KPA",
      options: [
        { content: "spory o właściwość", isCorrect: false },
        { content: "skargi do sądu", isCorrect: false },
        { content: "podatki", isCorrect: true },
      ],
    });
  });

  it("recognizes numeric answer labels and keeps option continuation lines", () => {
    const result = parseAnkiText(
      '"Wybierz odpowiedź:\n1. Pierwsza linia\nciąg dalszy\n3) Trzecia\n2. Druga"\t"Odpowiedź: 3"',
      "Test.txt",
      [],
    );

    expect(result.questions[0]).toMatchObject({
      mode: "test",
      options: [
        { content: "Pierwsza linia\nciąg dalszy", isCorrect: false },
        { content: "Trzecia", isCorrect: true },
        { content: "Druga", isCorrect: false },
      ],
    });
  });

  it("recognizes options collapsed by Anki into one paragraph", () => {
    const result = parseAnkiText(
      '"2. Na korektę deklaracji dokonaną przez organ podatkowy podatnik może wnieść: a) skargę do organu, który dokonał korekty, b) sprzeciw do organu, który dokonał korekty, c) zażalenie do organu wyższego stopnia."\t"Prawidłowa odpowiedź: B Podstawa prawna: Art. 274 § 3 Ordynacji podatkowej"',
      "Prawo.txt",
      [],
    );

    expect(result.questions[0]).toEqual({
      mode: "test",
      content:
        "2. Na korektę deklaracji dokonaną przez organ podatkowy podatnik może wnieść:",
      explanation: "Podstawa prawna: Art. 274 § 3 Ordynacji podatkowej",
      options: [
        {
          content: "skargę do organu, który dokonał korekty,",
          isCorrect: false,
        },
        {
          content: "sprzeciw do organu, który dokonał korekty,",
          isCorrect: true,
        },
        {
          content: "zażalenie do organu wyższego stopnia.",
          isCorrect: false,
        },
      ],
    });
  });

  it("does not confuse legal year abbreviations with lettered options", () => {
    const result = parseAnkiText(
      '"77. Datą wszczęcia postępowania podatkowego jest: a) na żądanie strony jest dzień wystawienia dowodu otrzymania, o którym mowa w art. 41 ustawy z dnia 18 listopada 2020 r. o doręczeniach elektronicznych, b) na żądanie strony jest dzień wystawienia dowodu nadania przez operatora pocztowego, c) na żądanie osoby niebędącą stroną jest dzień wystawienia dowodu otrzymania, o którym mowa w art. 41 ustawy z dnia 18 listopada 2020 r. o doręczeniach elektronicznych."\t"Prawidłowa odpowiedź: A\n\nPodstawa prawna:\nArt. 165 § 3b Ordynacji podatkowej"',
      "Prawo.txt",
      [],
    );

    expect(result.questions[0]).toMatchObject({
      mode: "test",
      content: "77. Datą wszczęcia postępowania podatkowego jest:",
      explanation: "Podstawa prawna:\nArt. 165 § 3b Ordynacji podatkowej",
      options: [
        { isCorrect: true },
        { isCorrect: false },
        { isCorrect: false },
      ],
    });
    expect(result.questions[0].options[0].content).toContain("2020 r.");
    expect(result.questions[0].options[2].content).toContain("2020 r.");
  });

  it("does not treat a leading question number as a numeric answer", () => {
    const result = parseAnkiText(
      '"12. Wybierz odpowiedź: 1) Pierwsza 3) Trzecia 2) Druga"\t"Odpowiedź: 3 Uzasadnienie"',
      "Test.txt",
      [],
    );

    expect(result.questions[0]).toMatchObject({
      mode: "test",
      content: "12. Wybierz odpowiedź:",
      explanation: "Uzasadnienie",
      options: [
        { content: "Pierwsza", isCorrect: false },
        { content: "Trzecia", isCorrect: true },
        { content: "Druga", isCorrect: false },
      ],
    });
  });

  it("keeps ambiguous multiple-correct cards as flashcards", () => {
    const front = "Wybierz:\na) Pierwsza\nb) Druga\nc) Trzecia";
    const back = "Prawidłowa odpowiedź: A, C";
    const result = parseAnkiText(`"${front}"\t"${back}"`, "Test.txt", []);

    expect(result.questions[0]).toMatchObject({
      mode: "flashcard",
      options: [{ content: back, isCorrect: true }],
    });
  });

  it("rejects exports without two populated fields", () => {
    expect(() => parseAnkiText("tylko jedno pole", "Zestaw.txt", [])).toThrow(
      "Nie znaleziono fiszek z dwoma polami",
    );
  });

  it.each([
    ["legacy", "collection.anki2", decompress(ZSTD_COLLECTION)],
    ["modern", "collection.21b", ZSTD_COLLECTION],
  ])(
    "imports %s APKG collections and expands cloze notes",
    async (_, name, data) => {
      const result = await parseAnkiPackage(
        zipSync({ [name]: data }),
        "Anatomia.apkg",
        ["Anatomia"],
      );

      expect(result).toMatchObject({
        kind: "questions",
        source: "anki",
        name: "Anatomia (2)",
        questions: [
          {
            mode: "flashcard",
            content: "Pytanie",
            options: [{ content: "Odpowiedź", isCorrect: true }],
          },
          {
            mode: "flashcard",
            content: "Tkanka […] i nerwowa",
            options: [
              {
                content: "Tkanka mięśniowa i nerwowa\n\nDodatkowa informacja",
                isCorrect: true,
              },
            ],
          },
          {
            mode: "flashcard",
            content: "Tkanka mięśniowa i [rodzaj tkanki]",
            options: [
              {
                content: "Tkanka mięśniowa i nerwowa\n\nDodatkowa informacja",
                isCorrect: true,
              },
            ],
          },
        ],
      });
      expect(result.warnings).toContain("Utworzono 2 fiszek z luk cloze.");
    },
  );

  it("rejects malformed APKG archives", async () => {
    await expect(
      parseAnkiPackage(new Uint8Array([1, 2, 3]), "Błędny.apkg", []),
    ).rejects.toThrow("Nie udało się otworzyć paczki Anki");
  });
});
