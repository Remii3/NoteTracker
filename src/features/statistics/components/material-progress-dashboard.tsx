import {
  ArrowUpDown,
  Award,
  BookOpenCheck,
  Brain,
  LoaderCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { StatisticsRepository } from "../data/statistics-repository";
import type {
  ProgressTopic,
  ProgressTopicCursor,
  ProgressTopicSort,
  StudyStatistics,
} from "../model/types";

const TOPIC_SORT_LABELS: Record<ProgressTopicSort, string> = {
  chapter: "Kolejność rozdziałów",
  completed: "Ukończone najpierw",
  incomplete: "Nieukończone najpierw",
};

export function MaterialProgressDashboard({
  data,
  moduleId,
  repository,
}: {
  data: StudyStatistics;
  moduleId: string | null;
  repository: StatisticsRepository;
}) {
  return (
    <div className="space-y-4">
      <CompletionOverview data={data} moduleId={moduleId} />
      {moduleId ? (
        <>
          <ChapterProgress data={data} />
          <TopicProgress moduleId={moduleId} repository={repository} />
        </>
      ) : (
        <ModuleProgress data={data} />
      )}
    </div>
  );
}

function CompletionOverview({
  data,
  moduleId,
}: {
  data: StudyStatistics;
  moduleId: string | null;
}) {
  const summary = data.progress.summary;
  const progress = getPercent(summary.completedTopics, summary.totalTopics);
  const details: [string, React.ReactNode][] = moduleId
    ? [
        ["Tematy", `${summary.completedTopics}/${summary.totalTopics}`],
        ["Rozdziały", `${summary.completedChapters}/${summary.totalChapters}`],
        ["Pozostało", summary.remainingTopics],
      ]
    : [
        ["Tematy", `${summary.completedTopics}/${summary.totalTopics}`],
        ["Rozdziały", `${summary.completedChapters}/${summary.totalChapters}`],
        ["Moduły", `${summary.completedModules}/${summary.totalModules}`],
      ];
  return (
    <section className="rounded-2xl border p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">Domknięcie materiału</h2>
        <p className="text-sm text-muted-foreground">
          Jeden widok pokazujący, ile materiału jest już za Tobą.
        </p>
      </div>
      <div className="mt-5 grid items-center gap-6 sm:grid-cols-[11rem_1fr]">
        <div
          className="relative mx-auto grid size-40 place-items-center rounded-full"
          style={{
            background: `conic-gradient(var(--primary) ${progress}%, color-mix(in oklch, var(--primary) 12%, transparent) 0)`,
          }}
          role="img"
          aria-label={`Ukończono ${progress}% materiału`}
        >
          <div className="grid size-28 place-items-center rounded-full bg-background text-center shadow-sm">
            <div>
              <p className="text-3xl font-semibold">{progress}%</p>
              <p className="text-xs text-muted-foreground">ukończono</p>
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {details.map(([label, value]) => (
            <div key={label} className="rounded-xl bg-muted/35 p-4">
              <p className="text-2xl font-semibold">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ModuleProgress({ data }: { data: StudyStatistics }) {
  const modules = [...data.progress.modules].sort(
    (a, b) =>
      getPercent(b.completedTopics, b.topics) -
      getPercent(a.completedTopics, a.topics),
  );
  return (
    <ProgressSection
      icon={<Award className="size-5 text-primary" />}
      title="Postęp modułów"
      description="Zaliczaj tematy, aby domykać rozdziały i całe moduły."
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => {
          const progress = getPercent(module.completedTopics, module.topics);
          return (
            <ProgressCard
              key={module.id}
              title={module.name}
              value={`${progress}%`}
              note={`${module.completedTopics}/${module.topics} tematów · ${module.completedChapters}/${module.chapters} rozdziałów`}
              progress={progress}
            />
          );
        })}
        {!modules.length && <EmptyProgress />}
      </div>
    </ProgressSection>
  );
}

function ChapterProgress({ data }: { data: StudyStatistics }) {
  const chapters = [...data.progress.chapters].sort(
    (a, b) =>
      getPercent(b.completedTopics, b.topics) -
      getPercent(a.completedTopics, a.topics),
  );
  return (
    <ProgressSection
      icon={<BookOpenCheck className="size-5 text-primary" />}
      title="Postęp rozdziałów"
      description="Każdy ukończony temat przybliża rozdział do zaliczenia."
    >
      <div className="grid gap-3 md:grid-cols-2">
        {chapters.map((chapter) => {
          const progress = getPercent(chapter.completedTopics, chapter.topics);
          return (
            <ProgressCard
              key={chapter.id}
              title={chapter.title}
              value={`${progress}%`}
              note={`${chapter.completedTopics} z ${chapter.topics} tematów ukończonych`}
              progress={progress}
            />
          );
        })}
        {!chapters.length && <EmptyProgress />}
      </div>
    </ProgressSection>
  );
}

function TopicProgress({
  moduleId,
  repository,
}: {
  moduleId: string;
  repository: StatisticsRepository;
}) {
  const [sort, setSort] = useState<ProgressTopicSort>("chapter");
  const [topics, setTopics] = useState<ProgressTopic[]>([]);
  const [cursor, setCursor] = useState<ProgressTopicCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    void repository
      .getTopicsPage({ moduleId, sort, cursor: null })
      .then((page) => {
        if (!active) return;
        setTopics(page.items);
        setCursor(page.nextCursor);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [moduleId, reloadToken, repository, sort]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(false);
    try {
      const page = await repository.getTopicsPage({ moduleId, sort, cursor });
      setTopics((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border">
      <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-end sm:p-6">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">Lista tematów</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Tematy są pobierane partiami, bez ładowania całej listy naraz.
          </p>
        </div>
        <Select
          value={sort}
          onValueChange={(value) => {
            const nextSort = value as ProgressTopicSort;
            if (nextSort === sort) return;
            setTopics([]);
            setCursor(null);
            setError(false);
            setLoading(true);
            setSort(nextSort);
          }}
        >
          <SelectTrigger className="w-full sm:w-60">
            <ArrowUpDown />
            <SelectValue>{TOPIC_SORT_LABELS[sort]}</SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            {(
              Object.entries(TOPIC_SORT_LABELS) as [ProgressTopicSort, string][]
            ).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="divide-y">
        {loading ? (
          <TopicListSkeleton />
        ) : topics.length ? (
          topics.map((topic) => (
            <div
              key={topic.id}
              className="flex items-center justify-between gap-4 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{topic.title}</p>
                <p className="text-xs text-muted-foreground">
                  {topic.chapterTitle}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium",
                  topic.completed
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {topic.completed ? "Ukończony" : "Do zrobienia"}
              </span>
            </div>
          ))
        ) : (
          <EmptyProgress />
        )}
      </div>
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 px-5 py-3 text-sm text-destructive"
        >
          <span>Nie udało się pobrać tematów.</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setError(false);
              setLoading(true);
              setReloadToken((value) => value + 1);
            }}
          >
            Spróbuj ponownie
          </Button>
        </div>
      )}
      {cursor && !loading && (
        <div className="border-t p-4 text-center">
          <Button
            variant="outline"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore && <LoaderCircle className="animate-spin" />}
            Pokaż więcej
          </Button>
        </div>
      )}
    </section>
  );
}

function TopicListSkeleton() {
  return (
    <div aria-label="Ładowanie tematów" className="divide-y">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex justify-between gap-4 px-5 py-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function ProgressSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border p-5 sm:p-6">
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ProgressCard({
  title,
  value,
  note,
  progress,
}: {
  title: string;
  value: string;
  note: string;
  progress: number;
}) {
  return (
    <div className="rounded-xl bg-muted/35 p-4">
      <div className="flex items-start justify-between gap-4">
        <p className="truncate font-medium">{title}</p>
        <p className="shrink-0 font-semibold">{value}</p>
      </div>
      <Progress className="mt-4 h-2" value={progress} />
      <p className="mt-2 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function EmptyProgress() {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground md:col-span-2">
      Dodaj tematy, aby zacząć budować postęp.
    </p>
  );
}

function getPercent(completed: number, total: number) {
  return total ? Math.round((completed * 100) / total) : 0;
}
