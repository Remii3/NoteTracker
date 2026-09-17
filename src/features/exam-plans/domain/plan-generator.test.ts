import { describe, expect, it } from "vitest";

import type { ExamPlanTopic } from "../model/types";
import { generateExamPlan } from "./plan-generator";

function topic(id: string, workloadPoints = 2): ExamPlanTopic {
  return {
    id,
    chapterId: "chapter-1",
    chapterTitle: "Rozdział",
    title: `Temat ${id}`,
    completed: false,
    workloadPoints,
    workloadSource: "automatic",
    questionCount: 4,
    dueReviewCount: 0,
  };
}

describe("generateExamPlan", () => {
  it("leaves the final study day as a review buffer", () => {
    const result = generateExamPlan({
      today: "2026-09-14",
      examDate: "2026-09-21",
      studyWeekdays: [1, 2, 3, 4, 5],
      bufferPercent: 10,
      targetRetention: 0.9,
      dailyQuestionLimit: null,
      topics: [topic("1"), topic("2")],
    });

    expect(result.bufferDays).toBe(1);
    expect(result.days.at(-1)).toMatchObject({
      date: "2026-09-18",
      isBufferDay: true,
      assignments: [],
    });
  });

  it("does not create a buffer when the user selects zero percent", () => {
    const result = generateExamPlan({
      today: "2026-09-14",
      examDate: "2026-09-19",
      studyWeekdays: [1, 2, 3, 4, 5],
      bufferPercent: 0,
      targetRetention: 0.9,
      dailyQuestionLimit: null,
      topics: [topic("1")],
    });

    expect(result.bufferDays).toBe(0);
    expect(result.days.every((day) => !day.isBufferDay)).toBe(true);
  });

  it("places a known FSRS due date on the next available study day", () => {
    const scheduledTopic = {
      ...topic("due"),
      questionCount: 1,
      reviewDueDates: ["2026-09-16"],
    };
    const result = generateExamPlan({
      today: "2026-09-14",
      examDate: "2026-09-21",
      studyWeekdays: [1, 3, 5],
      bufferPercent: 0,
      targetRetention: 0.9,
      dailyQuestionLimit: null,
      topics: [scheduledTopic],
    });

    expect(
      result.days.find((day) => day.date === "2026-09-16")?.reviewForecastLow,
    ).toBeGreaterThan(0);
  });

  it("balances workload points without splitting a topic", () => {
    const result = generateExamPlan({
      today: "2026-09-14",
      examDate: "2026-09-19",
      studyWeekdays: [1, 2, 3, 4, 5],
      bufferPercent: 20,
      targetRetention: 0.9,
      dailyQuestionLimit: null,
      topics: [topic("long", 6), topic("short-1", 1), topic("short-2", 1)],
    });

    expect(result.days.flatMap((day) => day.assignments)).toHaveLength(3);
    expect(
      result.days.flatMap((day) => day.assignments).map((item) => item.topicId),
    ).toEqual(["long", "short-1", "short-2"]);
  });

  it("keeps a manually locked assignment during regeneration", () => {
    const result = generateExamPlan({
      today: "2026-09-14",
      examDate: "2026-09-21",
      studyWeekdays: [1, 2, 3, 4, 5],
      bufferPercent: 10,
      targetRetention: 0.9,
      dailyQuestionLimit: null,
      topics: [topic("1"), topic("2")],
      lockedAssignments: [
        {
          topicId: "2",
          scheduledFor: "2026-09-17",
          position: 1,
          workloadPoints: 2,
          isLocked: true,
          completedAt: null,
        },
      ],
    });

    expect(
      result.days.find((day) => day.date === "2026-09-17")?.assignments,
    ).toContainEqual(expect.objectContaining({ topicId: "2", isLocked: true }));
    expect(
      result.days
        .flatMap((day) => day.assignments)
        .filter((item) => item.topicId === "2"),
    ).toHaveLength(1);
  });

  it("warns when the review floor exceeds the question limit", () => {
    const result = generateExamPlan({
      today: "2026-09-14",
      examDate: "2026-09-16",
      studyWeekdays: [1, 2],
      bufferPercent: 10,
      targetRetention: 0.95,
      dailyQuestionLimit: 1,
      topics: [topic("1")],
    });

    expect(result.feasible).toBe(false);
    expect(result.warnings).toContain(
      "Limit pytań jest niższy niż prognozowane minimum powtórek.",
    );
  });

  it("uses calibrated review pace for the daily time limit", () => {
    const result = generateExamPlan({
      today: "2026-09-14",
      examDate: "2026-09-18",
      studyWeekdays: [1, 2, 3, 4],
      bufferPercent: 10,
      targetRetention: 0.9,
      dailyQuestionLimit: null,
      dailyTimeLimitMinutes: 5,
      reviewSecondsPerQuestion: 60,
      topics: [topic("long", 6)],
    });

    expect(result.days.some((day) => day.isOverloaded)).toBe(true);
    expect(result.warnings).toContain(
      "Dzienny limit czasu jest niższy niż ostrożna prognoza obciążenia.",
    );
    expect(result.days[0].estimatedMinutesHigh).toBeGreaterThan(
      result.days[0].estimatedMinutesLow ?? 0,
    );
  });

  it("does not schedule a topic already covered by a higher-priority plan", () => {
    const result = generateExamPlan({
      today: "2026-09-14",
      examDate: "2026-09-21",
      studyWeekdays: [1, 2, 3, 4, 5],
      bufferPercent: 10,
      targetRetention: 0.9,
      dailyQuestionLimit: null,
      topics: [topic("shared"), topic("unique")],
      creditedTopicIds: ["shared"],
    });

    expect(result.creditedTopicCount).toBe(1);
    expect(
      result.days.flatMap((day) => day.assignments).map((item) => item.topicId),
    ).toEqual(["unique"]);
    expect(result.feasible).toBe(true);
  });
});
