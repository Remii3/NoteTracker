// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ModuleImportDialog } from "./module-import-dialog";
import { parseDocxFile } from "./docx-import";

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

  expect(screen.getByText("Microsoft Word")).toBeTruthy();
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
