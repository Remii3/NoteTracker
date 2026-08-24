import { ChevronRight, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Chapter, Topic } from "../model/types";

type Props = {
  chapters: Chapter[];
  onClose: () => void;
  onLoadTopics: (chapterId: string) => Promise<Topic[] | null>;
  onDelete: (chapterIds: string[], topicIds: string[]) => Promise<boolean>;
};

export function BulkDeleteDialog({
  chapters,
  onClose,
  onLoadTopics,
  onDelete,
}: Props) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(
    new Set(),
  );
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const phrase = query.trim().toLocaleLowerCase("pl");
  const visibleChapters = useMemo(
    () =>
      phrase
        ? chapters.filter(
            (chapter) =>
              chapter.title.toLocaleLowerCase("pl").includes(phrase) ||
              chapter.topics.some((topic) =>
                topic.title.toLocaleLowerCase("pl").includes(phrase),
              ),
          )
        : chapters,
    [chapters, phrase],
  );
  const selectedCount = selectedChapters.size + selectedTopics.size;
  const affectedTopicCount =
    chapters.reduce(
      (count, chapter) =>
        count + (selectedChapters.has(chapter.id) ? chapter.topicsCount : 0),
      0,
    ) + selectedTopics.size;

  function toggleChapter(chapter: Chapter, checked: boolean) {
    setSelectedChapters((current) => {
      const next = new Set(current);
      if (checked) next.add(chapter.id);
      else next.delete(chapter.id);
      return next;
    });
    if (checked) {
      setSelectedTopics((current) => {
        const next = new Set(current);
        for (const topic of chapter.topics) next.delete(topic.id);
        return next;
      });
    }
  }

  function toggleTopic(topicId: string, checked: boolean) {
    setSelectedTopics((current) => {
      const next = new Set(current);
      if (checked) next.add(topicId);
      else next.delete(topicId);
      return next;
    });
  }

  function toggleExpanded(chapter: Chapter) {
    const willOpen = !expanded.has(chapter.id);
    setExpanded((current) => {
      const next = new Set(current);
      if (willOpen) next.add(chapter.id);
      else next.delete(chapter.id);
      return next;
    });
    if (willOpen && chapter.topicsStatus !== "loaded")
      void onLoadTopics(chapter.id);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="flex max-h-[min(90dvh,52rem)] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Usuń wiele elementów</DialogTitle>
          <DialogDescription>
            Wybierz całe rozdziały albo pojedyncze tematy. Usunięte zostaną też
            ich notatki i zdjęcia.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Szukaj rozdziału"
          />
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              Rozdziały: {selectedChapters.size} · Tematy: {affectedTopicCount}
            </span>
            {selectedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedChapters(new Set());
                  setSelectedTopics(new Set());
                }}
              >
                Wyczyść wybór
              </Button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
            {visibleChapters.map((chapter) => {
              const isExpanded = expanded.has(chapter.id);
              const chapterSelected = selectedChapters.has(chapter.id);
              const selectedTopicCount = chapter.topics.filter((topic) =>
                selectedTopics.has(topic.id),
              ).length;
              return (
                <div key={chapter.id} className="border-b last:border-b-0">
                  <div className="flex min-w-0 items-center gap-2 px-3 py-2.5">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={
                        isExpanded ? "Zwiń rozdział" : "Rozwiń rozdział"
                      }
                      onClick={() => toggleExpanded(chapter)}
                    >
                      <ChevronRight
                        className={isExpanded ? "rotate-90" : undefined}
                      />
                    </Button>
                    <Checkbox
                      checked={chapterSelected}
                      indeterminate={!chapterSelected && selectedTopicCount > 0}
                      aria-label={`Wybierz rozdział ${chapter.title}`}
                      onCheckedChange={(checked) =>
                        toggleChapter(chapter, checked)
                      }
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-sm font-medium"
                      onClick={() => toggleExpanded(chapter)}
                    >
                      {chapter.title}
                    </button>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {chapter.topicsCount} tematów
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="border-t bg-muted/20 px-3 py-2 pl-12">
                      {chapter.topicsStatus === "loading" ? (
                        <div className="space-y-2 py-1">
                          <Skeleton className="h-5 w-4/5" />
                          <Skeleton className="h-5 w-3/5" />
                        </div>
                      ) : chapter.topics.length ? (
                        <div className="space-y-1">
                          {chapter.topics.map((topic) => (
                            <label
                              key={topic.id}
                              className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                            >
                              <Checkbox
                                checked={
                                  chapterSelected ||
                                  selectedTopics.has(topic.id)
                                }
                                disabled={chapterSelected}
                                onCheckedChange={(checked) =>
                                  toggleTopic(topic.id, checked)
                                }
                              />
                              <span className="truncate text-sm">
                                {topic.title}
                              </span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <p className="py-2 text-sm text-muted-foreground">
                          Ten rozdział nie ma tematów.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!visibleChapters.length && (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nie znaleziono rozdziału.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Tej operacji nie będzie można cofnąć.
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onClose}>
            Anuluj
          </Button>
          <Button
            variant="destructive"
            disabled={!selectedCount || submitting}
            onClick={async () => {
              setSubmitting(true);
              const deleted = await onDelete(
                [...selectedChapters],
                [...selectedTopics],
              );
              setSubmitting(false);
              if (deleted) onClose();
            }}
          >
            <Trash2 />
            {submitting
              ? "Usuwanie…"
              : selectedCount
                ? `Usuń wybrane (${selectedCount})`
                : "Usuń wybrane"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
