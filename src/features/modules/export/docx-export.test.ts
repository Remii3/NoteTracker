import mammoth from "mammoth";
import { Packer } from "docx";
import { describe, expect, it } from "vitest";

import type { ModuleExportData } from "../data/modules-repository";
import { createModuleDocx, safeFilename } from "./docx-export";

describe("DOCX export", () => {
  it("keeps the module hierarchy and note content", async () => {
    const module: ModuleExportData = {
      id: "module",
      name: "Biologia",
      chapters: [
        {
          id: "chapter",
          title: "Komórka",
          position: 1000,
          topics: [
            {
              id: "topic",
              title: "Budowa komórki",
              position: 1000,
              completed: true,
              content: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: "Ważna",
                        marks: [{ type: "bold" }],
                      },
                      { type: "text", text: " treść notatki." },
                    ],
                  },
                  {
                    type: "bulletList",
                    content: [
                      {
                        type: "listItem",
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "Pierwszy punkt" }],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: "table",
                    content: [
                      {
                        type: "tableRow",
                        content: [
                          {
                            type: "tableHeader",
                            content: [
                              {
                                type: "paragraph",
                                content: [{ type: "text", text: "Organellum" }],
                              },
                            ],
                          },
                          {
                            type: "tableCell",
                            content: [
                              {
                                type: "paragraph",
                                content: [{ type: "text", text: "Funkcja" }],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const buffer = await Packer.toBuffer(await createModuleDocx(module));
    const { value } = await mammoth.extractRawText({ buffer });

    expect(value).toContain("Biologia");
    expect(value).toContain("1. Komórka");
    expect(value).toContain("1.1 Budowa komórki");
    expect(value).toContain("Ważna treść notatki.");
    expect(value).toContain("Pierwszy punkt");
    expect(value).toContain("Organellum");
    expect(value).toContain("Funkcja");
  });

  it("creates a filesystem-safe Word filename", () => {
    expect(safeFilename(" Anatomia: serce/układ? ")).toBe(
      "Anatomia- serce-układ-",
    );
    expect(safeFilename("... ")).toBe("modul");
  });
});
