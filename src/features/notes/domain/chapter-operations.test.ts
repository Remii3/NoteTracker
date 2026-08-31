import { describe, expect, it } from "vitest";

import type { Chapter, Topic } from "../model/types";
import {
  addTopicsToChapter,
  deleteManagedItems,
  moveTopic,
  reorderChapters,
  reorderTopic,
  toggleChapterTopics,
  updateTopic,
  withPositions,
} from "./chapter-operations";

function topic(id: string, completed = false, slug = id): Topic {
  return {
    id,
    slug,
    title: `Temat ${id}`,
    content: { type: "doc" },
    completed,
    position: 1000,
  };
}

function chapter(id: string, topics: Topic[]): Chapter {
  const firstIncomplete = topics.find((item) => !item.completed);
  return {
    id,
    slug: id,
    title: `Rozdział ${id}`,
    position: 1000,
    topics,
    topicsStatus: "loaded",
    topicsCount: topics.length,
    completedTopicsCount: topics.filter((item) => item.completed).length,
    firstIncompleteTopicId: firstIncomplete?.id ?? null,
    firstIncompleteTopicSlug: firstIncomplete?.slug ?? null,
  };
}

describe("chapter operations", () => {
  it("assigns stable positions in list order", () => {
    expect(withPositions([topic("a"), topic("b")])).toMatchObject([
      { id: "a", position: 1000 },
      { id: "b", position: 2000 },
    ]);
  });

  it("toggles all topics and synchronizes the chapter summary", () => {
    const result = toggleChapterTopics(
      [chapter("c1", [topic("t1"), topic("t2")])],
      "c1",
      true,
    )[0];

    expect(result.topics.every((item) => item.completed)).toBe(true);
    expect(result).toMatchObject({
      completedTopicsCount: 2,
      firstIncompleteTopicId: null,
      firstIncompleteTopicSlug: null,
    });
  });

  it("updates one topic and recalculates the next incomplete topic", () => {
    const original = [chapter("c1", [topic("t1"), topic("t2")])];
    const result = updateTopic(original, "c1", "t1", (item) => ({
      ...item,
      completed: true,
    }));

    expect(result[0]).toMatchObject({
      completedTopicsCount: 1,
      firstIncompleteTopicId: "t2",
    });
    expect(original[0].topics[0].completed).toBe(false);
  });

  it("adds and deletes topics while keeping summary counts correct", () => {
    const initial = [chapter("c1", [topic("t1", true)])];
    const added = addTopicsToChapter(initial, "c1", [topic("t2")]);
    const result = deleteManagedItems(added, [], ["t1"]);

    expect(result[0].topics.map((item) => item.id)).toEqual(["t2"]);
    expect(result[0]).toMatchObject({
      topicsCount: 1,
      completedTopicsCount: 0,
      firstIncompleteTopicId: "t2",
    });
  });

  it("reorders chapters and topics and assigns new positions", () => {
    const chapters = [
      chapter("c1", [topic("t1"), topic("t2")]),
      chapter("c2", []),
    ];

    expect(reorderChapters(chapters, "c2", "c1")).toMatchObject([
      { id: "c2", position: 1000 },
      { id: "c1", position: 2000 },
    ]);
    expect(reorderTopic(chapters, "c1", "t2", "t1")[0].topics).toMatchObject([
      { id: "t2", position: 1000 },
      { id: "t1", position: 2000 },
    ]);
  });

  it("returns the original list when a reorder or move target is invalid", () => {
    const chapters = [chapter("c1", [topic("t1")])];

    expect(reorderChapters(chapters, "missing", "c1")).toBe(chapters);
    expect(moveTopic(chapters, "t1", "missing", 0)).toBe(chapters);
    expect(moveTopic(chapters, "t1", "c1", 0)).toBe(chapters);
  });

  it("moves a topic, resolves a slug collision and synchronizes both chapters", () => {
    const chapters = [
      chapter("source", [topic("moving", false, "intro")]),
      chapter("target", [topic("existing", true, "intro")]),
    ];
    const result = moveTopic(chapters, "moving", "target", 0);

    expect(result[0]).toMatchObject({
      topics: [],
      topicsCount: 0,
      firstIncompleteTopicId: null,
    });
    expect(result[1].topics).toMatchObject([
      { id: "moving", slug: "temat-moving", position: 1000 },
      { id: "existing", position: 2000 },
    ]);
    expect(result[1]).toMatchObject({
      topicsCount: 2,
      completedTopicsCount: 1,
      firstIncompleteTopicId: "moving",
    });
  });
});
