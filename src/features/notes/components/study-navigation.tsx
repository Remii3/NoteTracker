import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { TopicNavigationItem } from "../model/types";

type Props = {
  previousTopic: TopicNavigationItem | null;
  nextTopic: TopicNavigationItem | null;
  currentIndex: number;
  total: number;
  onOpenTopic: (topic: TopicNavigationItem) => void;
};

export function StudyNavigation({
  previousTopic,
  nextTopic,
  currentIndex,
  total,
  onOpenTopic,
}: Props) {
  return (
    <nav
      aria-label="Nawigacja między tematami"
      className="flex h-16 shrink-0 items-center justify-between gap-3 border-t bg-background/95 px-3 backdrop-blur sm:px-6"
    >
      <Button
        type="button"
        variant="ghost"
        className="h-auto w-[38%] min-w-0 justify-start p-2 sm:w-full sm:max-w-80"
        disabled={!previousTopic}
        onClick={() => previousTopic && onOpenTopic(previousTopic)}
      >
        <ArrowLeft />
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {previousTopic?.chapterTitle}
          </span>
          <span className="block truncate">{previousTopic?.topicTitle}</span>
        </span>
      </Button>

      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {currentIndex + 1} / {total}
      </span>

      <Button
        type="button"
        variant="ghost"
        className="h-auto w-[38%] min-w-0 justify-end p-2 sm:w-full sm:max-w-80"
        disabled={!nextTopic}
        onClick={() => nextTopic && onOpenTopic(nextTopic)}
      >
        <span className="min-w-0 flex-1 text-right">
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {nextTopic?.chapterTitle}
          </span>
          <span className="block truncate">{nextTopic?.topicTitle}</span>
        </span>
        <ArrowRight />
      </Button>
    </nav>
  );
}
