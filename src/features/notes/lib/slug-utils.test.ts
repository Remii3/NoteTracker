import { describe, expect, it } from "vitest";

import { createSlug, createUniqueSlug } from "./slug-utils";

describe("slug utils", () => {
  it("normalizes Polish characters, whitespace and punctuation", () => {
    expect(createSlug("  Żółć i ćma!  ")).toBe("zolc-i-cma");
  });

  it("returns an empty slug when the value has no supported characters", () => {
    expect(createSlug("--- 🎓 ---")).toBe("");
  });

  it("uses the fallback and finds the first free numeric suffix", () => {
    expect(createUniqueSlug("🎓", ["temat", "temat-2"], "temat")).toBe(
      "temat-3",
    );
  });

  it("does not add a suffix to an unused slug", () => {
    expect(createUniqueSlug("Nowy temat", ["inny-temat"], "temat")).toBe(
      "nowy-temat",
    );
  });
});
