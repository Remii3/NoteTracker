import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Clock3,
  Flame,
  History,
  Medal,
  Target,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { StatisticsRepository } from "../data/statistics-repository";
import {
  areaStatus,
  type DailyStatistics,
  type StatisticsMode,
  type StatisticsRange,
  type StudyStatistics,
} from "../model/types";

type Metric = "answers" | "sessions" | "duration";

type Props = {
  repository: StatisticsRepository;
  moduleId: string | null;
  moduleName?: string;
  onBack: () => void;
  onOpenHistory?: () => void;
};

const RANGE_LABELS: Record<StatisticsRange, string> = {
  0: "Cały okres",
  7: "7 dni",
  30: "30 dni",
  90: "90 dni",
};

export function StatisticsPage({
  repository,
  moduleId,
  moduleName,
  onBack,
  onOpenHistory,
}: Props) {
  const [range, setRange] = useState<StatisticsRange>(30);
  const [mode, setMode] = useState<StatisticsMode>("all");
  const [data, setData] = useState<StudyStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<Metric>("answers");
  const [goal, setGoal] = useState("150");
  const [savingGoal, setSavingGoal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await repository.get({
        moduleId,
        range,
        mode,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      setData(next);
      setGoal(String(next.weeklyGoal.minutes));
    } catch {
      toast.error("Nie udało się pobrać statystyk.");
    } finally {
      setLoading(false);
    }
  }, [mode, moduleId, range, repository]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function saveGoal() {
    const minutes = Number(goal);
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 10_080) {
      toast.error("Cel musi wynosić od 15 do 10 080 minut.");
      return;
    }
    setSavingGoal(true);
    try {
      await repository.saveWeeklyGoal(minutes);
      setData((current) =>
        current
          ? { ...current, weeklyGoal: { ...current.weeklyGoal, minutes } }
          : current,
      );
      toast.success("Cel tygodniowy został zapisany.");
    } catch {
      toast.error("Nie udało się zapisać celu.");
    } finally {
      setSavingGoal(false);
    }
  }

  const accuracyChange =
    data?.summary.previousAccuracy == null
      ? null
      : data.summary.accuracy - data.summary.previousAccuracy;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <Button variant="ghost" className="mb-4 -ml-3" onClick={onBack}>
              <ArrowLeft /> {moduleId ? "Strona główna" : "Moduły"}
            </Button>
            <p className="mb-2 text-sm font-medium text-primary">Twoja nauka</p>
            <h1 className="text-3xl font-semibold">Statystyki</h1>
            <p className="mt-2 text-muted-foreground">
              {moduleId ? moduleName : "Wszystkie moduły"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select
              value={String(range)}
              onValueChange={(value) =>
                setRange(Number(value) as StatisticsRange)
              }
            >
              <SelectTrigger>
                <CalendarDays />
                <SelectValue>{RANGE_LABELS[range]}</SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                {([7, 30, 90, 0] as const).map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {RANGE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={mode}
              onValueChange={(value) => setMode(value as StatisticsMode)}
            >
              <SelectTrigger>
                <SelectValue>
                  {mode === "all"
                    ? "Wszystkie tryby"
                    : mode === "test"
                      ? "Testy"
                      : "Fiszki"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all">Wszystkie tryby</SelectItem>
                <SelectItem value="test">Testy</SelectItem>
                <SelectItem value="flashcards">Fiszki</SelectItem>
              </SelectContent>
            </Select>
            {onOpenHistory && (
              <Button variant="outline" onClick={onOpenHistory}>
                <History /> Historia
              </Button>
            )}
          </div>
        </header>

        {loading || !data ? (
          <LoadingState />
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                icon={<Target />}
                label="Skuteczność"
                value={`${data.summary.accuracy}%`}
                note={
                  accuracyChange == null
                    ? "Brak poprzedniego okresu"
                    : `${accuracyChange >= 0 ? "+" : ""}${accuracyChange} pp vs wcześniej`
                }
              />
              <SummaryCard
                icon={<BarChart3 />}
                label="Odpowiedzi"
                value={data.summary.answers}
                note={`${data.summary.completedSessions} ukończonych sesji`}
              />
              <SummaryCard
                icon={<Clock3 />}
                label="Czas nauki"
                value={formatDuration(data.summary.durationSeconds)}
                note={`${data.summary.activeDays} aktywnych dni`}
              />
              <SummaryCard
                icon={<Flame />}
                label="Bieżąca seria"
                value={`${data.summary.currentStreak} dni`}
                note={`Rekord: ${data.summary.longestStreak} dni`}
              />
            </section>

            <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <div className="rounded-2xl border p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Aktywność</h2>
                    <p className="text-sm text-muted-foreground">
                      Dzień po dniu w wybranym okresie
                    </p>
                  </div>
                  <div className="flex rounded-lg bg-muted p-1">
                    {(["answers", "sessions", "duration"] as const).map(
                      (value) => (
                        <Button
                          key={value}
                          size="sm"
                          variant={metric === value ? "secondary" : "ghost"}
                          onClick={() => setMetric(value)}
                        >
                          {value === "answers"
                            ? "Odpowiedzi"
                            : value === "sessions"
                              ? "Sesje"
                              : "Czas"}
                        </Button>
                      ),
                    )}
                  </div>
                </div>
                <ActivityChart daily={data.daily} metric={metric} />
              </div>
              <WeeklyGoal
                data={data}
                goal={goal}
                saving={savingGoal}
                onChange={setGoal}
                onSave={() => void saveGoal()}
              />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border p-5 sm:p-6">
                <div className="flex items-center gap-2">
                  <TrendingUp className="size-5 text-primary" />
                  <h2 className="text-lg font-semibold">Trend wyników</h2>
                </div>
                <SessionTrendChart sessions={data.sessionTrend} />
              </div>
              <div className="rounded-2xl border p-5 sm:p-6">
                <div className="flex items-center gap-2">
                  <Medal className="size-5 text-primary" />
                  <h2 className="text-lg font-semibold">Rekordy</h2>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  <Record
                    value={`${data.records.bestAccuracy}%`}
                    label="Najlepsza sesja"
                  />
                  <Record
                    value={data.records.mostAnswersInDay}
                    label="Odpowiedzi w dzień"
                  />
                  <Record
                    value={
                      data.records.mostActiveDate
                        ? formatShortDate(data.records.mostActiveDate)
                        : "—"
                    }
                    label="Najaktywniejszy dzień"
                  />
                </div>
              </div>
            </section>

            {moduleId ? (
              <AreasTable data={data} />
            ) : (
              <ModulesTable data={data} />
            )}

            <section className="rounded-2xl border p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Ostatnie sesje</h2>
              <div className="mt-4 divide-y">
                {data.recentSessions.length ? (
                  data.recentSessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div>
                        <p className="font-medium">
                          {session.mode === "test" ? "Test" : "Fiszki"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {!moduleId && `${session.moduleName} · `}
                          {formatDateTime(session.startedAt)} ·{" "}
                          {formatDuration(session.durationSeconds)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{session.accuracy}%</p>
                        <p className="text-xs text-muted-foreground">
                          {session.answers} odpowiedzi
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState />
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  note,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  note: string;
}) {
  return (
    <div className="rounded-xl border p-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="text-primary [&_svg]:size-4">{icon}</span>
        {label}
      </div>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function ActivityChart({
  daily,
  metric,
}: {
  daily: DailyStatistics[];
  metric: Metric;
}) {
  const values = daily.map((item) =>
    metric === "answers"
      ? item.answers
      : metric === "sessions"
        ? item.sessions
        : Math.round(item.durationSeconds / 60),
  );
  const max = Math.max(1, ...values);
  const visible =
    daily.length > 45
      ? daily.filter(
          (_, index) =>
            index % Math.ceil(daily.length / 45) === 0 ||
            index === daily.length - 1,
        )
      : daily;
  return (
    <div className="mt-6">
      <div
        className="flex h-44 items-end gap-1"
        role="img"
        aria-label="Wykres aktywności"
      >
        {visible.map((item) => {
          const value =
            metric === "answers"
              ? item.answers
              : metric === "sessions"
                ? item.sessions
                : Math.round(item.durationSeconds / 60);
          return (
            <div key={item.date} className="group relative min-w-0 flex-1">
              <div
                className="w-full rounded-t bg-primary/75 transition-colors hover:bg-primary"
                style={{
                  height: `${Math.max(value ? 6 : 2, (value / max) * 160)}px`,
                  opacity: value ? 1 : 0.18,
                }}
              />
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background group-hover:block">
                {formatShortDate(item.date)}: {value}
                {metric === "duration" ? " min" : ""}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{daily[0] ? formatShortDate(daily[0].date) : ""}</span>
        <span>{daily.at(-1) ? formatShortDate(daily.at(-1)!.date) : ""}</span>
      </div>
    </div>
  );
}

function WeeklyGoal({
  data,
  goal,
  saving,
  onChange,
  onSave,
}: {
  data: StudyStatistics;
  goal: string;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const completedMinutes = Math.round(data.weeklyGoal.completedSeconds / 60);
  const progress = Math.min(
    100,
    (completedMinutes * 100) / data.weeklyGoal.minutes,
  );
  return (
    <div className="rounded-2xl border p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Target className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">Cel tygodniowy</h2>
      </div>
      <p className="mt-5 text-3xl font-semibold">
        {completedMinutes}{" "}
        <span className="text-base font-normal text-muted-foreground">
          / {data.weeklyGoal.minutes} min
        </span>
      </p>
      <Progress className="mt-3" value={progress} />
      <div className="mt-5 flex gap-2">
        <Input
          type="number"
          min={15}
          max={10080}
          value={goal}
          onChange={(event) => onChange(event.target.value)}
          aria-label="Cel tygodniowy w minutach"
        />
        <Button
          disabled={saving || goal === String(data.weeklyGoal.minutes)}
          onClick={onSave}
        >
          {saving ? "Zapisuję…" : "Zapisz"}
        </Button>
      </div>
    </div>
  );
}

function SessionTrendChart({
  sessions,
}: {
  sessions: StudyStatistics["sessionTrend"];
}) {
  if (!sessions.length) return <EmptyState />;
  return (
    <div className="mt-6 flex h-40 items-end gap-2">
      {sessions.slice(-20).map((session) => (
        <div key={session.id} className="group relative flex-1">
          <div
            className="min-h-1 rounded-t bg-primary/75"
            style={{ height: `${Math.max(4, session.accuracy * 1.35)}px` }}
          />
          <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background group-hover:block">
            {formatShortDate(session.date)} · {session.accuracy}%
          </span>
        </div>
      ))}
    </div>
  );
}

function AreasTable({ data }: { data: StudyStatistics }) {
  return (
    <section className="overflow-hidden rounded-2xl border">
      <div className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Mocne i słabe obszary</h2>
        <p className="text-sm text-muted-foreground">
          Najpierw pokazujemy materiał wymagający uwagi.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-y bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th className="px-5 py-3 font-medium">Obszar</th>
              <th className="px-5 py-3 font-medium">Odpowiedzi</th>
              <th className="px-5 py-3 font-medium">Skuteczność</th>
              <th className="px-5 py-3 font-medium">Ostatnia nauka</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.areas.length ? (
              data.areas.map((area, index) => (
                <tr
                  key={`${area.chapterId}:${area.topicId ?? index}`}
                  className="border-b last:border-0"
                >
                  <td className="px-5 py-3">
                    <p className="font-medium">
                      {area.topicTitle ?? area.chapterTitle}
                    </p>
                    {area.topicTitle && (
                      <p className="text-xs text-muted-foreground">
                        {area.chapterTitle}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3">{area.answers}</td>
                  <td className="px-5 py-3 font-medium">{area.accuracy}%</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {area.lastStudiedAt
                      ? formatShortDate(area.lastStudiedAt)
                      : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-muted px-2 py-1 text-xs">
                      {areaStatus(area.answers, area.accuracy)}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5}>
                  <EmptyState />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ModulesTable({ data }: { data: StudyStatistics }) {
  return (
    <section className="overflow-hidden rounded-2xl border">
      <div className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Moduły</h2>
        <p className="text-sm text-muted-foreground">
          Porównanie wszystkich obszarów nauki.
        </p>
      </div>
      <div className="divide-y">
        {data.modules.map((module) => (
          <div
            key={module.id}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-5 px-5 py-4"
          >
            <div>
              <p className="font-medium">{module.name}</p>
              <p className="text-xs text-muted-foreground">
                {module.lastStudiedAt
                  ? `Ostatnio ${formatShortDate(module.lastStudiedAt)}`
                  : "Brak aktywności"}
              </p>
            </div>
            <span className="text-sm text-muted-foreground">
              {module.answers} odp.
            </span>
            <span className="w-12 text-right font-semibold">
              {module.accuracy}%
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Record({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
function EmptyState() {
  return (
    <p className="py-10 text-center text-sm text-muted-foreground">
      Brak danych dla wybranych filtrów.
    </p>
  );
}
function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-36 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}
function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} godz. ${rest} min` : `${hours} godz.`;
}
function formatShortDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "short",
  }).format(date);
}
function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Nieznana data";
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
