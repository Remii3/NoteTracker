import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  CircleDashed,
  LibraryBig,
  Target,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getProgress, selectDashboardSummary } from "../lib/chapter-selectors";
import type { Chapter, LearningSummary } from "../model/types";

type Props = {
  chapters: Chapter[];
  userName?: string;
  summary?: LearningSummary | null;
  onOpenChapter: (chapterId: string, topicId: string) => void;
  onBrowseChapters: () => void;
};

export function LearningDashboard({
  chapters,
  userName,
  summary,
  onOpenChapter,
  onBrowseChapters,
}: Props) {
  const firstName = userName?.trim().split(/\s+/)[0];
  const localSummary = selectDashboardSummary(chapters);
  const { completedChapters, completedTopics, nextTopic, totalTopics } =
    summary ?? localSummary;
  const totalChapters = summary?.totalChapters ?? chapters.length;
  const progress = getProgress(completedTopics, totalTopics);

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
              Dzień dobry{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-3 text-muted-foreground">{message}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {nextTopic && (
              <Button
                size="lg"
                onClick={() => onOpenChapter(nextTopic.chapterId, nextTopic.id)}
              >
                Kontynuuj naukę <ArrowRight />
              </Button>
            )}
            <Button size="lg" variant="outline" onClick={onBrowseChapters}>
              <LibraryBig /> Przeglądaj rozdziały
            </Button>
          </div>
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
            value={`${completedChapters}/${totalChapters}`}
            label="Ukończone rozdziały"
          />
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
