import { useEffect } from "react";

import type { TopicNavigationItem } from "../model/types";

type Options = {
  enabled: boolean;
  previousTopic: TopicNavigationItem | null;
  nextTopic: TopicNavigationItem | null;
  onOpenTopic: (topic: TopicNavigationItem) => void;
};

export function useStudyKeyboardNavigation({
  enabled,
  previousTopic,
  nextTopic,
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

      const targetTopic =
        event.key === "ArrowRight" ? nextTopic : previousTopic;
      if (!targetTopic) return;

      event.preventDefault();
      onOpenTopic(targetTopic);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, nextTopic, onOpenTopic, previousTopic]);
}
