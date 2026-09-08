import { describe, expect, it } from "vitest";
import { areaStatus } from "./types";

describe("areaStatus", () => {
  it("requires a meaningful sample before grading an area", () => {
    expect(areaStatus(4, 100)).toBe("Za mało danych");
    expect(areaStatus(5, 59)).toBe("Do powtórki");
    expect(areaStatus(5, 60)).toBe("W trakcie");
    expect(areaStatus(5, 80)).toBe("Mocny");
  });
});
