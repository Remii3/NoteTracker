import { describe, expect, it } from "vitest";

import type { Chapter, Topic } from "../model/types";
import {
  getProgress,
  isChapterCompleted,
  selectDashboardSummary,
  selectVisibleChapters,
} from "./chapter-selectors";

function topic(id: string, title: string, completed = false): Topic {
  return {
    id,
    slug: id,
    title,
    completed,
    content: { type: "doc" },
    position: 1000,
  };
}

function chapter(
  id: string,
  title: string,
  topics: Topic[],
  position: number,
): Chapter {
  const firstIncomplete = topics.find((item) => !item.completed);
  return {
    id,
    slug: id,
    title,
    topics,
    position,
    topicsCount: topics.length,
    completedTopicsCount: topics.filter((item) => item.completed).length,
    firstIncompleteTopicId: firstIncomplete?.id ?? null,
    firstIncompleteTopicSlug: firstIncomplete?.slug ?? null,
    topicsStatus: "loaded",
  };
}

const chapters = [
  chapter("c10", "Rozdział 10", [topic("t1", "Algebra", true)], 2000),
  chapter("c2", "Rozdział 2", [topic("t2", "Żółć")], 1000),
  chapter("empty", "Pusty", [], 3000),
];

describe("chapter selectors", () => {
  it("treats only non-empty fully completed chapters as completed", () => {
    expect(isChapterCompleted(chapters[0])).toBe(true);
    expect(isChapterCompleted(chapters[2])).toBe(false);
  });

  it("calculates rounded progress and handles an empty total", () => {
    expect(getProgress(2, 3)).toBe(67);
    expect(getProgress(0, 0)).toBe(0);
  });

  it("builds the dashboard summary and points to the next topic", () => {
    expect(selectDashboardSummary(chapters)).toMatchObject({
      completedChapters: 1,
      completedTopics: 1,
      nextTopic: { id: "t2", chapterId: "c2" },
      progress: 50,
      totalTopics: 2,
    });
  });

  it("filters by topic title and includes only matching topics", () => {
    const result = selectVisibleChapters(chapters, " żÓŁ ", "manual");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c2");
    expect(result[0].topics.map((item) => item.id)).toEqual(["t2"]);
  });

  it("sorts manually, naturally by title and by completion", () => {
    expect(
      selectVisibleChapters(chapters, "", "manual").map((item) => item.id),
    ).toEqual(["c2", "c10", "empty"]);
    expect(
      selectVisibleChapters(chapters, "", "az").map((item) => item.id),
    ).toEqual(["empty", "c2", "c10"]);
    expect(
      selectVisibleChapters(chapters, "", "completed").map((item) => item.id),
    ).toEqual(["c10", "c2", "empty"]);
  });
});
