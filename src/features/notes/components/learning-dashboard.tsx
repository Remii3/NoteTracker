import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  CircleDashed,
  Target,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  getProgress,
  selectChapterNextTopic,
  selectDashboardSummary,
} from "../lib/chapter-selectors";
import type { Chapter } from "../model/types";

const DASHBOARD_CHAPTER_LIMIT = 6;

type Props = {
  chapters: Chapter[];
  onOpenChapter: (chapterId: string, topicId: string) => void;
};

export function LearningDashboard({ chapters, onOpenChapter }: Props) {
  const dashboardChapters = chapters.slice(0, DASHBOARD_CHAPTER_LIMIT);
  const {
    completedChapters,
    completedTopics,
    nextTopic,
    progress,
    totalTopics,
  } = selectDashboardSummary(chapters);

  const message =
    progress === 100
      ? "Wszystkie obecne tematy są ukończone. Świetna robota!"
      : progress > 0
        ? "Każdy ukończony temat przybliża Cię do celu."
        : "Zacznij od pierwszego tematu i zbuduj swój rytm nauki.";

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="mx-auto max-w-6xl space-y-10">
        <section className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="mb-2 text-sm font-medium text-primary">Twoja nauka</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Dzień dobry, Remi
            </h1>
            <p className="mt-3 text-muted-foreground">{message}</p>
          </div>
          {nextTopic && (
            <Button
              size="lg"
              onClick={() => onOpenChapter(nextTopic.chapterId, nextTopic.id)}
            >
              Kontynuuj naukę <ArrowRight />
            </Button>
          )}
        </section>

        <section className="rounded-2xl border bg-muted/20 p-6 sm:p-8">
          <div className="flex flex-col gap-8 md:flex-row md:items-center">
            <div
              className="grid size-32 shrink-0 place-items-center rounded-full"
              style={{
                background: `conic-gradient(var(--primary) ${progress}%, color-mix(in oklch, var(--primary) 10%, transparent) 0)`,
              }}
              aria-hidden
            >
              <div className="grid size-24 place-items-center rounded-full bg-background">
                <div className="text-center">
                  <p className="text-2xl font-semibold">{progress}%</p>
                  <p className="text-xs text-muted-foreground">ukończono</p>
                </div>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Ogólny postęp</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {completedTopics} z {totalTopics} tematów za Tobą
                  </p>
                </div>
                <Target className="size-6 text-primary" />
              </div>
              <Progress value={progress} aria-label="Ogólny postęp nauki" />
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <SummaryItem
            icon={<CheckCircle2 />}
            value={completedTopics}
            label="Ukończone tematy"
          />
          <SummaryItem
            icon={<CircleDashed />}
            value={Math.max(0, totalTopics - completedTopics)}
            label="Tematy przed Tobą"
          />
          <SummaryItem
            icon={<BookOpenCheck />}
            value={`${completedChapters}/${chapters.length}`}
            label="Ukończone rozdziały"
          />
        </section>

        <section>
          <div className="mb-5">
            <h2 className="text-xl font-semibold">Postęp w rozdziałach</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Wybierz rozdział, aby wrócić do jego tematów.
            </p>
          </div>
          {chapters.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {dashboardChapters.map((chapter) => {
                const nextChapterTopic = selectChapterNextTopic(chapter);
                const completed = chapter.topics.filter(
                  (topic) => topic.completed,
                ).length;
                const chapterProgress = getProgress(
                  completed,
                  chapter.topics.length,
                );
                return (
                  <button
                    key={chapter.id}
                    type="button"
                    className="group rounded-xl border bg-background p-5 text-left transition-colors hover:border-primary/40 hover:bg-muted/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    onClick={() =>
                      onOpenChapter(chapter.id, nextChapterTopic?.id ?? "")
                    }
                  >
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">
                          {chapter.title}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {completed} z {chapter.topics.length} tematów
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-primary">
                        {chapterProgress}%
                      </span>
                    </div>
                    <Progress
                      value={chapterProgress}
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
            <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
              Dodaj pierwszy rozdział, aby rozpocząć naukę.
            </div>
          )}
          {chapters.length > DASHBOARD_CHAPTER_LIMIT && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Pozostałe rozdziały znajdziesz w panelu bocznym.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function SummaryItem({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border p-5">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-5">
        {icon}
      </span>
      <div>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
