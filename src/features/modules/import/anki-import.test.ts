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
      kind: "flashcards",
      source: "anki",
      name: "Biologia (2)",
      cards: [
        { front: "Mitochondrium", back: "Elektrownia komórki" },
        { front: "Jądro", back: "Przechowuje DNA" },
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

    expect(result.cards).toEqual([{ front: "ATP", back: "Nośnik\nenergii" }]);
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

    expect(result.cards[0]).toEqual({
      front: "Pytanie",
      back: "Odpowiedź\nw dwóch liniach",
    });
    expect(result.warnings).toContain(
      "Notatki mają więcej niż dwa pola; zaimportowano pierwsze dwa pola każdej notatki.",
    );
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
        kind: "flashcards",
        source: "anki",
        name: "Anatomia (2)",
        cards: [
          { front: "Pytanie", back: "Odpowiedź" },
          {
            front: "Tkanka […] i nerwowa",
            back: "Tkanka mięśniowa i nerwowa\n\nDodatkowa informacja",
          },
          {
            front: "Tkanka mięśniowa i [rodzaj tkanki]",
            back: "Tkanka mięśniowa i nerwowa\n\nDodatkowa informacja",
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
