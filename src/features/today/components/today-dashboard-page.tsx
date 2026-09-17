import { useCallback, useState, type FormEvent } from "react";
import type { NavigateFunction } from "react-router";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  GraduationCap,
  Play,
  RotateCcw,
  Sparkles,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { useAsyncResource } from "@/hooks/use-async-resource";
import type { TodayRepository } from "../data/today-repository";
import type {
  TodayDashboard,
  TodayQuestion,
  TodayTaskType,
  TodayTopic,
} from "../model/types";

type Props = {
  repository: TodayRepository;
  userName: string | null;
  onChanged: () => void;
  onNavigate: NavigateFunction;
};

export function TodayDashboardPage(props: Props) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const load = useCallback(
    () => props.repository.get(timezone),
    [props.repository, timezone],
  );
  const resource = useAsyncResource(load);
  const [starting, setStarting] = useState(false);
  const [deferring, setDeferring] = useState<string | null>(null);
  const [examOpen, setExamOpen] = useState(false);

  if (resource.loading) return <TodaySkeleton />;
  if (resource.failed || !resource.value)
    return (
      <main className="flex-1 overflow-y-auto p-5 sm:p-8">
        <div className="mx-auto max-w-6xl rounded-xl border bg-card p-8 text-center">
          <h1 className="text-xl font-semibold">
            Nie udało się otworzyć planu dnia
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sprawdź połączenie i spróbuj ponownie.
          </p>
          <Button className="mt-5" onClick={resource.retry}>
            <RotateCcw /> Spróbuj ponownie
          </Button>
        </div>
      </main>
    );

  const data = resource.value;

  async function deferTask(
    taskType: TodayTaskType,
    taskId: string,
    days: number,
  ) {
    setDeferring(`${taskType}:${taskId}`);
    try {
      await props.repository.deferTask({
        taskType,
        taskId,
        until: addDays(data.date, days),
      });
      toast.add({
        data: { type: "success" },
        description:
          days === 1 ? "Odroczono do jutra." : `Odroczono o ${days} dni.`,
      });
      props.onChanged();
    } catch {
      toast.add({
        data: { type: "error" },
        description: "Nie udało się odroczyć zadania.",
      });
      setDeferring(null);
    }
  }

  async function startSession() {
    if (!data.sessionTarget || starting) return;
    setStarting(true);
    try {
      const sessionId = await props.repository.createQuickSession(
        data.sessionTarget.moduleId,
        timezone,
      );
      props.onNavigate(
        `/${data.sessionTarget.moduleSlug}/study/flashcards/${sessionId}?from=today`,
        { state: { moduleId: data.sessionTarget.moduleId } },
      );
    } catch {
      toast.add({
        data: { type: "error" },
        description: "Nie udało się rozpocząć sesji.",
      });
      setStarting(false);
    }
  }

  return (
    <main className="flex-1 overflow-y-auto bg-muted/25 p-4 sm:p-7 lg:p-9">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-primary">
              {formatLongDate(data.date)}
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
              {greeting()}, {firstName(props.userName) ?? "czas na naukę"}
            </h1>
            <p className="mt-2 text-muted-foreground">
              Najważniejsze rzeczy na dziś — bez przekopywania się przez
              statystyki.
            </p>
          </div>
          <Button
            size="lg"
            className="h-12 px-5 shadow-sm"
            disabled={!data.sessionTarget || starting}
            onClick={() => void startSession()}
          >
            <Play className="fill-current" />
            {starting ? "Przygotowuję sesję…" : "Rozpocznij 10-minutową sesję"}
          </Button>
        </header>

        <div className="grid gap-4 lg:grid-cols-3">
          <WeeklyGoalCard data={data} />
          <ExamCard data={data} onEdit={() => setExamOpen(true)} />
          <SummaryCard data={data} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <BookOpenCheck className="size-5" />
                </span>
                <div>
                  <CardTitle className="text-lg">Pytania na dziś</CardTitle>
                  <CardDescription>
                    {data.dueQuestionCount
                      ? `${data.dueQuestionCount} pytań czeka na powtórkę`
                      : "Na dziś nie zostały żadne zaległe pytania"}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="gap-0 px-0">
              {data.dueQuestions.length ? (
                data.dueQuestions.map((question) => (
                  <QuestionRow
                    key={question.id}
                    question={question}
                    busy={deferring === `question:${question.id}`}
                    onOpen={() =>
                      props.onNavigate(`/${question.moduleSlug}/questions`, {
                        state: { moduleId: question.moduleId },
                      })
                    }
                    onDefer={(days) =>
                      void deferTask("question", question.id, days)
                    }
                  />
                ))
              ) : (
                <EmptyState
                  icon={CheckCircle2}
                  title="Plan pytań jest czysty"
                  description="Możesz rozpocząć krótką sesję albo przejść do rekomendowanych tematów."
                />
              )}
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-chart-2/15 text-chart-4 dark:text-chart-2">
                  <Sparkles className="size-5" />
                </span>
                <div>
                  <CardTitle className="text-lg">Warto kontynuować</CardTitle>
                  <CardDescription>
                    Nieukończone tematy w najlepszej kolejności
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="gap-0 px-0">
              {data.recommendedTopics.length ? (
                data.recommendedTopics.map((topic) => (
                  <TopicRow
                    key={topic.id}
                    topic={topic}
                    busy={deferring === `topic:${topic.id}`}
                    onOpen={() =>
                      props.onNavigate(
                        `/${topic.moduleSlug}/chapters/${topic.chapterSlug}/${topic.topicSlug}`,
                        { state: { moduleId: topic.moduleId } },
                      )
                    }
                    onDefer={(days) => void deferTask("topic", topic.id, days)}
                  />
                ))
              ) : (
                <EmptyState
                  icon={CheckCircle2}
                  title="Wszystko ukończone"
                  description="Nie znaleźliśmy kolejnego tematu do polecenia."
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ExamDialog
        open={examOpen}
        data={data}
        repository={props.repository}
        onOpenChange={setExamOpen}
        onSaved={props.onChanged}
      />
    </main>
  );
}

function WeeklyGoalCard({ data }: { data: TodayDashboard }) {
  const { completed, target, enabled } = data.weeklyGoal;
  const progress = target
    ? Math.min(100, Math.round((completed / target) * 100))
    : 0;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="size-4 text-primary" /> Cel tygodniowy
        </CardTitle>
        <CardAction className="text-2xl font-semibold">
          {enabled ? `${completed}/${target}` : "—"}
        </CardAction>
      </CardHeader>
      <CardContent>
        <Progress
          value={enabled ? progress : 0}
          aria-label="Postęp celu tygodniowego"
        />
        <p className="text-xs text-muted-foreground">
          {enabled
            ? progress >= 100
              ? "Cel osiągnięty — świetna robota."
              : `${Math.max(0, target - completed)} tematów do celu`
            : "Cel jest wyłączony w preferencjach."}
        </p>
      </CardContent>
    </Card>
  );
}

function ExamCard({
  data,
  onEdit,
}: {
  data: TodayDashboard;
  onEdit: () => void;
}) {
  const exam = data.nearestExam;
  const progress = exam?.topicsCount
    ? Math.round((exam.completedTopicsCount / exam.topicsCount) * 100)
    : 0;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="size-4 text-primary" /> Najbliższy egzamin
        </CardTitle>
        <CardAction>
          <Button size="xs" variant="ghost" onClick={onEdit}>
            {exam ? "Zmień" : "Ustaw"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {exam ? (
          <>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="font-medium">{exam.moduleName}</p>
                <p className="text-xs text-muted-foreground">
                  {daysTo(data.date, exam.examDate)}
                </p>
              </div>
              <span className="font-semibold">{progress}%</span>
            </div>
            <Progress value={progress} aria-label="Postęp do egzaminu" />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Dodaj termin, aby zobaczyć tempo przygotowań.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryCard({ data }: { data: TodayDashboard }) {
  const summary = data.recentSummary;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock3 className="size-4 text-primary" /> Ostatnia sesja
        </CardTitle>
      </CardHeader>
      <CardContent>
        {summary ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold">
                {summary.successful}/{summary.answers}
              </span>
              <span className="text-xs text-muted-foreground">
                poprawnych odpowiedzi
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDuration(summary.durationSeconds)} aktywnej nauki · dzisiaj
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Po zakończeniu sesji zobaczysz tu krótkie podsumowanie.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function QuestionRow({
  question,
  busy,
  onOpen,
  onDefer,
}: {
  question: TodayQuestion;
  busy: boolean;
  onOpen: () => void;
  onDefer: (days: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b px-5 py-4 last:border-b-0">
      <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <p className="line-clamp-2 font-medium">{question.content}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {question.moduleName}
          {question.topicTitle ? ` · ${question.topicTitle}` : ""}
          {` · ${learningStatusLabel(question.learningStatus)}`}
        </p>
      </button>
      <DeferMenu busy={busy} onDefer={onDefer} />
    </div>
  );
}

function learningStatusLabel(status: TodayQuestion["learningStatus"]) {
  return {
    new: "Nowe",
    learning: "Uczone",
    mastered: "Opanowane",
    overdue: "Zaległe",
  }[status];
}

function TopicRow({
  topic,
  busy,
  onOpen,
  onDefer,
}: {
  topic: TodayTopic;
  busy: boolean;
  onOpen: () => void;
  onDefer: (days: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b px-5 py-4 last:border-b-0">
      <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <p className="truncate font-medium">{topic.title}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {topic.moduleName} · {topic.chapterTitle}
        </p>
      </button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Otwórz ${topic.title}`}
        onClick={onOpen}
      >
        <ArrowRight />
      </Button>
      <DeferMenu busy={busy} onDefer={onDefer} compact />
    </div>
  );
}

function DeferMenu({
  busy,
  onDefer,
  compact = false,
}: {
  busy: boolean;
  onDefer: (days: number) => void;
  compact?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size={compact ? "icon-sm" : "sm"}
            disabled={busy}
            aria-label="Odrocz zadanie"
          />
        }
      >
        <CalendarClock />
        {!compact && <span className="hidden sm:inline">Odrocz</span>}
        {!compact && <ChevronDown />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => onDefer(1)}>Do jutra</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDefer(3)}>O 3 dni</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDefer(7)}>
          O tydzień
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof CheckCircle2;
  title: string;
  description: string;
}) {
  return (
    <div className="px-6 py-10 text-center">
      <Icon className="mx-auto size-7 text-primary" />
      <p className="mt-3 font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function ExamDialog({
  open,
  data,
  repository,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  data: TodayDashboard;
  repository: TodayRepository;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const initialModule = data.nearestExam?.moduleId ?? data.modules[0]?.id ?? "";
  const [moduleId, setModuleId] = useState(initialModule);
  const [examDate, setExamDate] = useState(
    data.modules.find((module) => module.id === initialModule)?.examDate ?? "",
  );
  const [saving, setSaving] = useState(false);

  function selectModule(value: string) {
    setModuleId(value);
    setExamDate(
      data.modules.find((module) => module.id === value)?.examDate ?? "",
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!moduleId) return;
    setSaving(true);
    try {
      await repository.setExamDate(moduleId, examDate || null);
      toast.add({
        data: { type: "success" },
        description: "Termin egzaminu zapisany.",
      });
      onOpenChange(false);
      onSaved();
    } catch {
      toast.add({
        data: { type: "error" },
        description: "Nie udało się zapisać terminu.",
      });
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Termin egzaminu</DialogTitle>
          <DialogDescription>
            Ekran Dzisiaj pokaże postęp dla najbliższego zaplanowanego egzaminu.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <label className="block space-y-2 text-sm font-medium">
            <span>Moduł</span>
            <select
              className="h-9 w-full rounded-md border bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              value={moduleId}
              disabled={saving}
              onChange={(event) => selectModule(event.target.value)}
            >
              {data.modules.map((module) => (
                <option key={module.id} value={module.id}>
                  {module.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Data egzaminu</span>
            <Input
              type="date"
              min={data.date}
              value={examDate}
              disabled={saving}
              onChange={(event) => setExamDate(event.target.value)}
            />
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Anuluj
            </Button>
            <Button type="submit" disabled={!moduleId || saving}>
              {saving ? "Zapisywanie…" : "Zapisz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TodaySkeleton() {
  return (
    <main
      className="flex-1 overflow-y-auto bg-muted/25 p-4 sm:p-7 lg:p-9"
      aria-label="Ładowanie planu dnia"
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-96 max-w-full" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-36 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    </main>
  );
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatLongDate(isoDate: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${isoDate}T12:00:00`));
}

function daysTo(today: string, examDate: string) {
  const days = Math.max(
    0,
    Math.round(
      (new Date(`${examDate}T12:00:00Z`).getTime() -
        new Date(`${today}T12:00:00Z`).getTime()) /
        86_400_000,
    ),
  );
  if (days === 0) return "Egzamin jest dzisiaj";
  if (days === 1) return "Egzamin jutro";
  return `${days} dni do egzaminu`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Dzień dobry";
  if (hour < 18) return "Dobrego popołudnia";
  return "Dobry wieczór";
}

function firstName(name: string | null) {
  return name?.trim().split(/\s+/)[0] || null;
}

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}
