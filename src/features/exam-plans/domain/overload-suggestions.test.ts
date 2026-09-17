import { describe, expect, it } from "vitest";

import type { ExamPlanDay } from "../model/types";
import { buildOverloadSuggestions } from "./overload-suggestions";

const overloadedDay: ExamPlanDay = {
  date: "2026-09-18",
  assignments: [],
  workloadPoints: 4,
  reviewTarget: 20,
  reviewForecastLow: 18,
  reviewForecastHigh: 24,
  isBufferDay: false,
  isOverloaded: true,
  estimatedMinutesLow: 35,
  estimatedMinutesHigh: 55,
};

describe("buildOverloadSuggestions", () => {
  it("suggests another weekday and a sufficient question limit", () => {
    const suggestions = buildOverloadSuggestions(
      {
        studyWeekdays: [1, 2, 3, 4, 5],
        dailyQuestionLimit: 10,
        dailyTimeLimitMinutes: null,
      },
      [overloadedDay],
      12,
    );

    expect(suggestions.map((suggestion) => suggestion.id)).toEqual([
      "add-day",
      "raise-limit",
      "reduce-scope",
    ]);
    expect(suggestions[1].title).toContain("18 pytań");
  });

  it("uses the conservative time estimate for a time limit", () => {
    const suggestions = buildOverloadSuggestions(
      {
        studyWeekdays: [0, 1, 2, 3, 4, 5, 6],
        dailyQuestionLimit: null,
        dailyTimeLimitMinutes: 20,
      },
      [overloadedDay],
      6,
    );

    expect(suggestions[0]).toMatchObject({
      id: "raise-limit",
      title: "Podnieś limit do około 35 minut",
    });
  });

  it("returns no advice for a feasible plan", () => {
    expect(
      buildOverloadSuggestions(
        {
          studyWeekdays: [1, 2, 3],
          dailyQuestionLimit: 20,
          dailyTimeLimitMinutes: null,
        },
        [{ ...overloadedDay, isOverloaded: false }],
        4,
      ),
    ).toEqual([]);
  });
});
