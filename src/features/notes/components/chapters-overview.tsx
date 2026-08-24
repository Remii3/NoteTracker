import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { getProgress } from "../lib/chapter-selectors";
import type { Chapter } from "../model/types";

const CHAPTERS_PER_PAGE = 20;

type Props = {
  chapters: Chapter[];
  onOpenChapter: (chapterId: string, topicId: string) => void;
};

export function ChaptersOverview({ chapters, onOpenChapter }: Props) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const filteredChapters = useMemo(() => {
    const phrase = query.trim().toLocaleLowerCase("pl");
    return phrase
      ? chapters.filter((chapter) =>
          chapter.title.toLocaleLowerCase("pl").includes(phrase),
        )
      : chapters;
  }, [chapters, query]);
  const totalPages = Math.max(
    1,
    Math.ceil(filteredChapters.length / CHAPTERS_PER_PAGE),
  );
  const currentPage = Math.min(page, totalPages);
  const visibleChapters = filteredChapters.slice(
    (currentPage - 1) * CHAPTERS_PER_PAGE,
    currentPage * CHAPTERS_PER_PAGE,
  );

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-sm font-medium text-primary">
              Twój plan nauki
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Wszystkie rozdziały
            </h1>
            <p className="mt-2 text-muted-foreground">
              {chapters.length}{" "}
              {chapters.length === 1 ? "rozdział" : "rozdziałów"} w ustalonej
              kolejności.
            </p>
          </div>
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Szukaj rozdziału"
              className="pl-9"
            />
          </div>
        </div>

        {visibleChapters.length ? (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {visibleChapters.map((chapter) => {
              const progress = getProgress(
                chapter.completedTopicsCount,
                chapter.topicsCount,
              );
              return (
                <button
                  key={chapter.id}
                  type="button"
                  className="group rounded-xl border bg-background p-5 text-left transition-colors hover:border-primary/40 hover:bg-muted/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  onClick={() =>
                    onOpenChapter(
                      chapter.id,
                      chapter.firstIncompleteTopicId ??
                        chapter.topics[0]?.id ??
                        "",
                    )
                  }
                >
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold">
                        {chapter.title}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {chapter.completedTopicsCount} z {chapter.topicsCount}{" "}
                        tematów
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-primary">
                      {progress}%
                    </span>
                  </div>
                  <Progress
                    value={progress}
                    aria-label={`Postęp rozdziału ${chapter.title}`}
                  />
                  <div className="mt-4 flex items-center justify-end gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-primary">
                    Otwórz rozdział <ArrowRight className="size-3.5" />
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-8 rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
            {chapters.length
              ? `Nie znaleziono rozdziału pasującego do „${query.trim()}”.`
              : "Dodaj pierwszy rozdział, aby rozpocząć naukę."}
          </div>
        )}

        {filteredChapters.length > CHAPTERS_PER_PAGE && (
          <nav
            aria-label="Strony rozdziałów"
            className="mt-6 flex items-center justify-center gap-3"
          >
            <Button
              type="button"
              variant="outline"
              disabled={currentPage === 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              <ArrowLeft /> Poprzednia
            </Button>
            <span className="text-sm tabular-nums text-muted-foreground">
              {currentPage} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={currentPage === totalPages}
              onClick={() =>
                setPage((value) => Math.min(totalPages, value + 1))
              }
            >
              Następna <ArrowRight />
            </Button>
          </nav>
        )}
      </div>
    </main>
  );
}
