import type { TopicNavigation, TopicNavigationItem } from "../model/types";

export function createTopicNavigation(
  topics: TopicNavigationItem[],
  currentTopicId: string,
): TopicNavigation {
  const currentIndex = topics.findIndex(
    (topic) => topic.topicId === currentTopicId,
  );
  if (currentIndex < 0) throw new Error("Nie znaleziono tematu.");
  return {
    previous: topics[currentIndex - 1] ?? null,
    next: topics[currentIndex + 1] ?? null,
    currentIndex,
    total: topics.length,
  };
}
