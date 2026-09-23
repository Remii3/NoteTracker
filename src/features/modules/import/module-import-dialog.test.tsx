// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ModuleImportDialog } from "./module-import-dialog";
import { parseAnkiFile } from "./anki-import";
import { parseDocxFile } from "./docx-import";

vi.mock("./anki-import", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./anki-import")>()),
  parseAnkiFile: vi.fn(),
}));

vi.mock("./docx-import", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./docx-import")>()),
  parseDocxFile: vi.fn(),
}));

vi.mock("@/features/notes/components/rich-text-editor", () => ({
  RichTextViewer: () => <div>Podgląd treści dokumentu</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("keeps the parsed Word document when returning from preview", async () => {
  vi.mocked(parseDocxFile).mockResolvedValue({
    kind: "content",
    source: "docx",
    name: "Biologia",
    warnings: [],
    chapters: [
      {
        title: "Wstęp",
        topics: [],
      },
      {
        title: "Komórka",
        topics: [
          {
            title: "Budowa komórki",
            content: { type: "doc", content: [{ type: "paragraph" }] },
          },
        ],
      },
    ],
  });

  render(
    <ModuleImportDialog
      existingModuleNames={["Chemia"]}
      onClose={vi.fn()}
      onImport={vi.fn()}
    />,
  );

  expect(
    screen.getByRole("button", { name: "Microsoft Word: Dokument DOCX" }),
  ).toBeTruthy();
  expect(
    screen.getByText("Import").closest("li")?.getAttribute("aria-current"),
  ).toBe("step");

  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).toBeTruthy();
  fireEvent.change(input!, {
    target: { files: [new File(["docx"], "biologia.docx")] },
  });

  expect(
    await screen.findByText("Wykryto 2 rozdziały i 1 temat."),
  ).toBeTruthy();
  expect(await screen.findByText("Podgląd treści dokumentu")).toBeTruthy();
  expect(screen.getByText("Wstęp").closest("button")).toBeNull();
  expect(screen.getByText("Wstęp").closest("[aria-expanded]")).toBeNull();
  expect(
    screen.getByText("Podgląd").closest("li")?.getAttribute("aria-current"),
  ).toBe("step");
  expect(parseDocxFile).toHaveBeenCalledWith(expect.any(File), ["Chemia"]);

  fireEvent.click(screen.getByRole("button", { name: "Wróć do importu" }));

  expect(screen.getByText("biologia.docx")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Przejdź do podglądu" }),
  ).toBeTruthy();
  expect(screen.queryByText("Wykryto 2 rozdziały i 1 temat.")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Przejdź do podglądu" }));
  expect(screen.getByText("Wykryto 2 rozdziały i 1 temat.")).toBeTruthy();
  expect(parseDocxFile).toHaveBeenCalledOnce();
});

it("accepts a DOCX file dropped into the import area", async () => {
  vi.mocked(parseDocxFile).mockResolvedValue({
    kind: "content",
    source: "docx",
    name: "Chemia",
    warnings: [],
    chapters: [
      {
        title: "Atomy",
        topics: [
          {
            title: "Budowa atomu",
            content: { type: "doc", content: [{ type: "paragraph" }] },
          },
        ],
      },
    ],
  });

  render(
    <ModuleImportDialog
      existingModuleNames={[]}
      onClose={vi.fn()}
      onImport={vi.fn()}
    />,
  );

  fireEvent.drop(
    screen.getByRole("button", { name: /Przeciągnij tutaj plik DOCX/ }),
    { dataTransfer: { files: [new File(["docx"], "chemia.docx")] } },
  );

  expect(await screen.findByText("Wykryto 1 rozdział i 1 temat.")).toBeTruthy();
  expect(parseDocxFile).toHaveBeenCalledWith(expect.any(File), []);
});

it("previews, edits and submits copied Quizlet cards", async () => {
  const onImport = vi.fn().mockResolvedValue(undefined);
  render(
    <ModuleImportDialog
      existingModuleNames={["Biologia"]}
      onClose={vi.fn()}
      onImport={onImport}
    />,
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Quizlet: Skopiowany tekst" }),
  );
  fireEvent.change(screen.getByLabelText("Nazwa modułu"), {
    target: { value: "Biologia" },
  });
  fireEvent.change(screen.getByLabelText("Fiszki z Quizleta"), {
    target: {
      value: "Mitochondrium\tElektrownia komórki\nJądro\tPrzechowuje DNA",
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Przejdź do podglądu" }));

  expect(await screen.findByText("Wykryto 2 fiszki.")).toBeTruthy();
  expect(screen.getByDisplayValue("Biologia (2)")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Definicja"), {
    target: { value: "Miejsce produkcji ATP" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Importuj moduł" }));

  expect(onImport).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "flashcards",
      source: "quizlet",
      name: "Biologia (2)",
      cards: [
        { front: "Mitochondrium", back: "Miejsce produkcji ATP" },
        { front: "Jądro", back: "Przechowuje DNA" },
      ],
    }),
  );
});

it("previews and submits an Anki text export", async () => {
  vi.mocked(parseAnkiFile).mockResolvedValue({
    kind: "flashcards",
    source: "anki",
    name: "Anatomia",
    warnings: [],
    cards: [
      { front: "Kość udowa", back: "Najdłuższa kość człowieka" },
      { front: "Łopatka", back: "Kość obręczy barkowej" },
    ],
  });
  const onImport = vi.fn().mockResolvedValue(undefined);
  render(
    <ModuleImportDialog
      existingModuleNames={[]}
      onClose={vi.fn()}
      onImport={onImport}
    />,
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Anki: APKG, TXT lub CSV" }),
  );
  const file = new File(["dane"], "Anatomia.txt", { type: "text/plain" });
  fireEvent.change(screen.getByLabelText("Plik eksportu Anki"), {
    target: { files: [file] },
  });

  expect(await screen.findByText("Wykryto 2 fiszki.")).toBeTruthy();
  expect(parseAnkiFile).toHaveBeenCalledWith(file, []);
  fireEvent.click(screen.getByRole("button", { name: "Wróć do importu" }));
  expect(screen.getByText("Anatomia.txt")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Przejdź do podglądu" }));
  fireEvent.click(screen.getByRole("button", { name: "Importuj moduł" }));

  expect(onImport).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "flashcards",
      source: "anki",
      name: "Anatomia",
    }),
  );
});
