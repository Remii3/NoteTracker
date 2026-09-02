import { describe, expect, it } from "vitest";

import type { TopicNavigationItem } from "../model/types";
import { createTopicNavigation } from "./topic-navigation";

const topics: TopicNavigationItem[] = ["1", "2"].map((id) => ({
  chapterId: "chapter",
  chapterSlug: "chapter",
  chapterTitle: "Rozdział",
  topicId: id,
  topicSlug: `topic-${id}`,
  topicTitle: `Temat ${id}`,
}));

describe("createTopicNavigation", () => {
  it("uses a zero-based current index for the displayed page number", () => {
    const navigation = createTopicNavigation(topics, "2");
    expect(navigation.currentIndex).toBe(1);
    expect(navigation.total).toBe(2);
    expect(navigation.currentIndex + 1).toBe(2);
  });

  it("sets navigation boundaries for the first and last topic", () => {
    expect(createTopicNavigation(topics, "1").previous).toBeNull();
    expect(createTopicNavigation(topics, "2").next).toBeNull();
  });
});
