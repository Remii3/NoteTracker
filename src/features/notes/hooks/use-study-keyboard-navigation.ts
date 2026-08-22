import { useEffect } from "react";

import type { StudyTopic } from "../model/workspace-types";

type Options = {
  enabled: boolean;
  topics: StudyTopic[];
  currentIndex: number;
  onOpenTopic: (topic: StudyTopic) => void;
};

export function useStudyKeyboardNavigation({
  enabled,
  topics,
  currentIndex,
  onOpenTopic,
}: Options) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
      )
        return;

      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, button, [role=checkbox], [contenteditable=true]",
        )
      )
        return;

      const nextIndex = currentIndex + (event.key === "ArrowRight" ? 1 : -1);
      const nextTopic = topics[nextIndex];
      if (!nextTopic) return;

      event.preventDefault();
      onOpenTopic(nextTopic);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, enabled, onOpenTopic, topics]);
}
