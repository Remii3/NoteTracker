import { describe, expect, it } from "vitest";

import { normalizeTitle, titlesAreEqual } from "./title-utils";

describe("title utils", () => {
  it("normalizes Unicode, casing and repeated whitespace", () => {
    expect(normalizeTitle("  Plan\tNAUKI\n  １  ")).toBe("plan nauki 1");
  });

  it("compares titles after normalization", () => {
    expect(titlesAreEqual("  ŻÓŁĆ   ", "żółć")).toBe(true);
    expect(titlesAreEqual("Temat 1", "Temat 2")).toBe(false);
  });
});
