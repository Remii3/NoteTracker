import { Award, BookOpenCheck, Brain } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { StudyStatistics } from "../model/types";

export function MaterialProgressDashboard({
  data,
  moduleId,
}: {
  data: StudyStatistics;
  moduleId: string | null;
}) {
  return (
    <div className="space-y-4">
      {moduleId ? (
        <>
          <ChapterProgress data={data} />
          <TopicProgress data={data} />
        </>
      ) : (
        <ModuleProgress data={data} />
      )}
    </div>
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

function TopicProgress({ data }: { data: StudyStatistics }) {
  const chapterNames = new Map(
    data.progress.chapters.map((chapter) => [chapter.id, chapter.title]),
  );
  return (
    <section className="overflow-hidden rounded-2xl border">
      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <Brain className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Lista tematów</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Konkretna lista rzeczy zaliczonych i pozostających do zrobienia.
        </p>
      </div>
      <div className="divide-y">
        {data.progress.topics.map((topic) => (
          <div
            key={topic.id}
            className="flex items-center justify-between gap-4 px-5 py-4"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{topic.title}</p>
              <p className="text-xs text-muted-foreground">
                {chapterNames.get(topic.chapterId) ?? "Rozdział"}
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
        ))}
        {!data.progress.topics.length && <EmptyProgress />}
      </div>
    </section>
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
