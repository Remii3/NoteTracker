import { describe, expect, it } from "vitest";

import {
  moveModule,
  normalizeModuleName,
  validateModuleName,
} from "./module-validation";

const modules = [
  { id: "a", name: "Matematyka", position: 1000, chaptersCount: 2 },
  { id: "b", name: "Fizyka", position: 2000, chaptersCount: 0 },
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
