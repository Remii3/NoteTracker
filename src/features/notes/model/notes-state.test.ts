import { describe, expect, it } from "vitest";

import type { Chapter } from "./types";
import { materializeChapters, normalizeChapters } from "./notes-state";

const chapters: Chapter[] = [
  {
    id: "chapter-1",
    slug: "pierwszy",
    title: "Pierwszy",
    position: 1000,
    topicsCount: 1,
    completedTopicsCount: 0,
    firstIncompleteTopicId: "topic-1",
    firstIncompleteTopicSlug: "wstep",
    topicsStatus: "loaded",
    topics: [
      {
        id: "topic-1",
        slug: "wstep",
        title: "Wstęp",
        content: { type: "doc" },
        completed: false,
        position: 1000,
      },
    ],
  },
];

describe("normalized notes state", () => {
  it("normalizes and materializes chapters without losing data", () => {
    const state = normalizeChapters(chapters);

    expect(state.chapterIds).toEqual(["chapter-1"]);
    expect(state.topicIdsByChapterId["chapter-1"]).toEqual(["topic-1"]);
    expect(state.chaptersById["chapter-1"]).not.toHaveProperty("topics");
    expect(materializeChapters(state)).toEqual(chapters);
  });

  it("ignores references to missing chapters and topics", () => {
    const state = normalizeChapters(chapters);
    state.chapterIds.push("missing-chapter");
    state.topicIdsByChapterId["chapter-1"].push("missing-topic");

    expect(materializeChapters(state)).toEqual(chapters);
  });
});
