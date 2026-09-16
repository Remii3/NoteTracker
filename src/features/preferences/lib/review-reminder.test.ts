import { describe, expect, it } from "vitest";

import { isReminderDue } from "./review-reminder";

describe("isReminderDue", () => {
  const now = new Date("2026-09-16T12:00:00.000Z").getTime();

  it("is due when no reminder has been displayed yet", () => {
    expect(isReminderDue(null, 7, now)).toBe(true);
  });

  it("uses the selected number of full days", () => {
    expect(isReminderDue("2026-09-09T12:00:00.000Z", 7, now)).toBe(true);
    expect(isReminderDue("2026-09-09T12:00:01.000Z", 7, now)).toBe(false);
  });
});
