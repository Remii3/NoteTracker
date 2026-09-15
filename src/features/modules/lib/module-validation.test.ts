import { describe, expect, it } from "vitest";

import {
  compareModuleNames,
  compareModules,
  moveModule,
  normalizeModuleName,
  validateModuleName,
} from "./module-validation";

const modules = [
  {
    id: "a",
    isPinned: false,
    slug: "matematyka",
    name: "Matematyka",
    position: 1000,
    chaptersCount: 2,
    completedChaptersCount: 1,
    topicsCount: 10,
    completedTopicsCount: 5,
  },
  {
    id: "b",
    isPinned: false,
    slug: "fizyka",
    name: "Fizyka",
    position: 2000,
    chaptersCount: 0,
    completedChaptersCount: 0,
    topicsCount: 0,
    completedTopicsCount: 0,
  },
];

describe("module validation", () => {
  it("normalizuje białe znaki", () => {
    expect(normalizeModuleName("  Analiza   danych  ")).toBe("Analiza danych");
  });

  it("odrzuca pustą i powtórzoną nazwę bez względu na wielkość liter", () => {
    expect(validateModuleName("   ", modules)).toBe("Podaj nazwę modułu.");
    expect(validateModuleName(" matematyka ", modules)).toBe(
      "Moduł o tej nazwie już istnieje.",
    );
    expect(validateModuleName("matematyka", modules, "a")).toBeNull();
  });

  it("sortuje moduły alfabetycznie, naturalnie i po polsku", () => {
    const names = ["Żywienie 10", "Analiza", "Żywienie 2"];

    expect(
      names
        .map((name) => ({ name }))
        .sort(compareModuleNames)
        .map(({ name }) => name),
    ).toEqual(["Analiza", "Żywienie 2", "Żywienie 10"]);
  });

  it("umieszcza przypięte moduły przed pozostałymi", () => {
    expect(
      [
        ...modules,
        { ...modules[0], id: "pinned", name: "Zoologia", isPinned: true },
      ]
        .sort(compareModules)
        .map(({ id }) => id),
    ).toEqual(["pinned", "b", "a"]);
  });

  it("przesuwa moduł i przelicza pozycje", () => {
    expect(
      moveModule(modules, "b", -1).map(({ id, position }) => ({
        id,
        position,
      })),
    ).toEqual([
      { id: "b", position: 1000 },
      { id: "a", position: 2000 },
    ]);
  });
});
