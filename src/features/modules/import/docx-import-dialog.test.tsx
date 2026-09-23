// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { DocxImportDialog } from "./docx-import-dialog";
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

it("moves from Word selection to preview and allows returning", async () => {
  vi.mocked(parseDocxFile).mockResolvedValue({
    name: "Biologia",
    warnings: [],
    chapters: [
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
    <DocxImportDialog
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
    await screen.findByText("Wykryto 1 rozdziałów i 1 tematów."),
  ).toBeTruthy();
  expect(
    screen.getByText("Podgląd").closest("li")?.getAttribute("aria-current"),
  ).toBe("step");
  expect(parseDocxFile).toHaveBeenCalledWith(expect.any(File), ["Chemia"]);

  fireEvent.click(screen.getByRole("button", { name: "Wróć do importu" }));

  expect(screen.getByText("Microsoft Word")).toBeTruthy();
  expect(screen.queryByText("Wykryto 1 rozdziałów i 1 tematów.")).toBeNull();
});
