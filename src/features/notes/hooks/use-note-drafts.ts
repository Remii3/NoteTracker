import { useCallback, useRef, useState } from "react";

import type { NoteContent, Topic } from "../model/types";

export function useNoteDrafts() {
  const drafts = useRef<Record<string, NoteContent>>({});
  const [dirtyTopicIds, setDirtyTopicIds] = useState(() => new Set<string>());

  const clearDraft = useCallback((topicId: string) => {
    delete drafts.current[topicId];
    setDirtyTopicIds((current) => {
      if (!current.has(topicId)) return current;
      const next = new Set(current);
      next.delete(topicId);
      return next;
    });
  }, []);

  const updateDraft = useCallback(
    (topic: Topic, content: NoteContent) => {
      const matchesSavedContent =
        JSON.stringify(content) === JSON.stringify(topic.content);

      if (matchesSavedContent) {
        clearDraft(topic.id);
        return;
      }

      drafts.current[topic.id] = content;
      setDirtyTopicIds((current) => {
        if (current.has(topic.id)) return current;
        return new Set(current).add(topic.id);
      });
    },
    [clearDraft],
  );

  const getContent = useCallback(
    (topic: Topic) => drafts.current[topic.id] ?? topic.content,
    [],
  );

  return {
    clearDraft,
    getContent,
    hasDirtyDrafts: dirtyTopicIds.size > 0,
    isTopicDirty: (topicId: string) => dirtyTopicIds.has(topicId),
    updateDraft,
  };
}
