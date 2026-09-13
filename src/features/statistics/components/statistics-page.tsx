import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Flame,
  History,
  ListFilter,
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
import {
  clearMemoryCacheByPrefix,
  readMemoryCache,
  writeMemoryCache,
} from "@/lib/memory-cache";
import type { StatisticsRepository } from "../data/statistics-repository";
import { MaterialProgressDashboard } from "./material-progress-dashboard";
import { AppHeaderActions } from "@/components/app-header";
import {
  areaStatus,
  type DailyStatistics,
  type StatisticsMode,
  type StatisticsRange,
  type StudyStatistics,
} from "../model/types";

type Metric = "completed" | "answers" | "sessions";

type Props = {
  repository: StatisticsRepository;
  moduleId: string | null;
  moduleName?: string;
  onBack?: () => void;
  onOpenHistory?: () => void;
  cacheScope?: string;
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
  cacheScope,
}: Props) {
  const [range, setRange] = useState<StatisticsRange>(30);
  const [mode, setMode] = useState<StatisticsMode>("all");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const requestKey = `v4:${moduleId ?? "all"}:${range}:${mode}:${timezone}`;
  const cacheKey = cacheScope
    ? `statistics:${cacheScope}:${requestKey}`
    : undefined;
  const cachedData = cacheKey
    ? readMemoryCache<StudyStatistics>(cacheKey)
    : undefined;
  const [result, setResult] = useState<{
    key: string;
    value: StudyStatistics;
  } | null>(null);
  const data = result?.key === requestKey ? result.value : cachedData;
  const [goalDraft, setGoalDraft] = useState<{
    key: string;
    value: string;
  } | null>(null);
  const goal =
    goalDraft?.key === requestKey
      ? goalDraft.value
      : String(data?.progress.weeklyGoal.topics ?? 5);
  const [metric, setMetric] = useState<Metric>("completed");
  const [savingGoal, setSavingGoal] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await repository.get({
        moduleId,
        range,
        mode,
        timezone,
      });
      setResult({ key: requestKey, value: next });
      if (cacheKey) writeMemoryCache(cacheKey, next);
    } catch {
      toast.error("Nie udało się pobrać statystyk.");
    }
  }, [cacheKey, mode, moduleId, range, repository, requestKey, timezone]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function saveGoal() {
    const topics = Number(goal);
    if (!Number.isInteger(topics) || topics < 1 || topics > 1000) {
      toast.error("Cel musi wynosić od 1 do 1000 tematów.");
      return;
    }
    setSavingGoal(true);
    try {
      await repository.saveWeeklyGoal(topics);
      if (data) {
        const next = {
          ...data,
          progress: {
            ...data.progress,
            weeklyGoal: { ...data.progress.weeklyGoal, topics },
          },
        };
        setResult({ key: requestKey, value: next });
        setGoalDraft(null);
        if (cacheScope) {
          clearMemoryCacheByPrefix(`statistics:${cacheScope}:`);
          if (cacheKey) writeMemoryCache(cacheKey, next);
        }
      }
      toast.success("Cel tygodniowy został zapisany.");
    } catch {
      toast.error("Nie udało się zapisać celu.");
    } finally {
      setSavingGoal(false);
    }
  }

  return (
    <>
      <AppHeaderActions>
        <Select
          value={String(range)}
          onValueChange={(value) => setRange(Number(value) as StatisticsRange)}
        >
          <SelectTrigger size="sm" aria-label="Zakres statystyk">
            <CalendarDays />
            <SelectValue className="hidden sm:flex">
              {RANGE_LABELS[range]}
            </SelectValue>
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
          <SelectTrigger size="sm" aria-label="Rodzaj powtórek">
            <ListFilter />
            <SelectValue className="hidden sm:flex">
              {mode === "all"
                ? "Wszystkie powtórki"
                : mode === "test"
                  ? "Testy"
                  : "Fiszki"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="all">Wszystkie powtórki</SelectItem>
            <SelectItem value="test">Testy</SelectItem>
            <SelectItem value="flashcards">Fiszki</SelectItem>
          </SelectContent>
        </Select>
        {onOpenHistory && (
          <Button
            size="sm"
            variant="outline"
            aria-label="Historia nauki"
            onClick={onOpenHistory}
          >
            <History />
            <span className="hidden sm:inline">Historia</span>
          </Button>
        )}
      </AppHeaderActions>
      <main className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
        <div className="mx-auto max-w-6xl space-y-8">
          <header>
            <div>
              {onBack && (
                <Button variant="ghost" className="mb-4 -ml-3" onClick={onBack}>
                  <ArrowLeft /> Wszystkie rozdziały
                </Button>
              )}
              <p className="mb-2 text-sm font-medium text-primary">
                Twoja nauka
              </p>
              <h1 className="text-3xl font-semibold">Statystyki</h1>
              <p className="mt-2 text-muted-foreground">
                {moduleId ? moduleName : "Wszystkie moduły"}
              </p>
            </div>
          </header>

          {!data ? (
            <LoadingState />
          ) : (
            <>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                  icon={<Target />}
                  label="Ukończone tematy"
                  value={`${data.progress.summary.completedTopics}/${data.progress.summary.totalTopics}`}
                  note={`${data.progress.summary.remainingTopics} tematów pozostało`}
                />
                <SummaryCard
                  icon={<BarChart3 />}
                  label="Ukończone rozdziały"
                  value={`${data.progress.summary.completedChapters}/${data.progress.summary.totalChapters}`}
                  note="Rozdział zalicza się po ukończeniu wszystkich tematów"
                />
                {moduleId ? (
                  <SummaryCard
                    icon={<Medal />}
                    label="Postęp modułu"
                    value={`${getPercent(data.progress.summary.completedTopics, data.progress.summary.totalTopics)}%`}
                    note={`${data.progress.summary.remainingTopics} tematów pozostało do ukończenia`}
                  />
                ) : (
                  <SummaryCard
                    icon={<Medal />}
                    label="Ukończone moduły"
                    value={`${data.progress.summary.completedModules}/${data.progress.summary.totalModules}`}
                    note="Moduł zalicza się po ukończeniu całego materiału"
                  />
                )}
                <SummaryCard
                  icon={<Flame />}
                  label="Seria zaliczeń"
                  value={`${data.progress.summary.currentStreak} dni`}
                  note={`Rekord: ${data.progress.summary.longestStreak} dni`}
                />
              </section>

              <MaterialProgressDashboard
                data={data}
                moduleId={moduleId}
                repository={repository}
              />

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
                      {(["completed", "answers", "sessions"] as const).map(
                        (value) => (
                          <Button
                            key={value}
                            size="sm"
                            variant={metric === value ? "secondary" : "ghost"}
                            onClick={() => setMetric(value)}
                          >
                            {value === "completed"
                              ? "Zaliczenia"
                              : value === "answers"
                                ? "Odpowiedzi"
                                : "Powtórki"}
                          </Button>
                        ),
                      )}
                    </div>
                  </div>
                  <ActivityChart
                    daily={data.daily}
                    progressDaily={data.progress.daily}
                    metric={metric}
                  />
                </div>
                <WeeklyGoal
                  data={data}
                  goal={goal}
                  saving={savingGoal}
                  onChange={(value) => setGoalDraft({ key: requestKey, value })}
                  onSave={() => void saveGoal()}
                />
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border p-5 sm:p-6">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="size-5 text-primary" />
                    <h2 className="text-lg font-semibold">
                      Trend wyników powtórek
                    </h2>
                  </div>
                  <SessionTrendChart sessions={data.sessionTrend} mode={mode} />
                </div>
                <div className="rounded-2xl border p-5 sm:p-6">
                  <div className="flex items-center gap-2">
                    <Medal className="size-5 text-primary" />
                    <h2 className="text-lg font-semibold">Jakość powtórek</h2>
                  </div>
                  <ReviewQualityChart data={data} />
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
                <h2 className="text-lg font-semibold">
                  Ostatnie sesje powtórek
                </h2>
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
                            {formatDateTime(session.startedAt)}
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
    </>
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
  progressDaily,
  metric,
}: {
  daily: DailyStatistics[];
  progressDaily: StudyStatistics["progress"]["daily"];
  metric: Metric;
}) {
  const studyByDate = new Map(daily.map((item) => [item.date, item]));
  const progressByDate = new Map(
    progressDaily.map((item) => [item.date, item.completedTopics]),
  );
  const rows = [...new Set([...studyByDate.keys(), ...progressByDate.keys()])]
    .sort()
    .map((date) => ({
      date,
      study: studyByDate.get(date),
      completedTopics: progressByDate.get(date) ?? 0,
    }));
  const getValue = (item: (typeof rows)[number]) =>
    metric === "completed"
      ? item.completedTopics
      : metric === "answers"
        ? (item.study?.answers ?? 0)
        : (item.study?.sessions ?? 0);
  const values = rows.map(getValue);
  const max = Math.max(1, ...values);
  const visible =
    rows.length > 45
      ? rows.filter(
          (_, index) =>
            index % Math.ceil(rows.length / 45) === 0 ||
            index === rows.length - 1,
        )
      : rows;
  return (
    <div className="mt-6">
      <div
        className="flex h-44 items-end gap-1"
        role="img"
        aria-label="Wykres aktywności"
      >
        {visible.map((item) => {
          const value = getValue(item);
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
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{rows[0] ? formatShortDate(rows[0].date) : ""}</span>
        <span>{rows.at(-1) ? formatShortDate(rows.at(-1)!.date) : ""}</span>
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
  const completedTopics = data.progress.weeklyGoal.completedTopics;
  const progress = Math.min(
    100,
    (completedTopics * 100) / data.progress.weeklyGoal.topics,
  );
  return (
    <div className="rounded-2xl border p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Target className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">Cel tygodniowy</h2>
      </div>
      <p className="mt-5 text-3xl font-semibold">
        {completedTopics}{" "}
        <span className="text-base font-normal text-muted-foreground">
          / {data.progress.weeklyGoal.topics} tematów
        </span>
      </p>
      <Progress className="mt-3" value={progress} />
      <p className="mt-3 text-sm text-muted-foreground">
        Najlepszy tydzień: {data.progress.weeklyGoal.bestCompletedTopics}{" "}
        ukończonych tematów
      </p>
      <div className="mt-5 flex gap-2">
        <Input
          type="number"
          min={1}
          max={1000}
          value={goal}
          onChange={(event) => onChange(event.target.value)}
          aria-label="Tygodniowy cel ukończonych tematów"
        />
        <Button
          disabled={saving || goal === String(data.progress.weeklyGoal.topics)}
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
  mode,
}: {
  sessions: StudyStatistics["sessionTrend"];
  mode: StatisticsMode;
}) {
  if (!sessions.length) return <EmptyState />;
  const visible = sessions.slice(-20);
  const points = visible.map((session, index) => ({
    ...session,
    x: visible.length === 1 ? 300 : 16 + (index / (visible.length - 1)) * 568,
    y: 148 - session.accuracy * 1.35,
  }));
  return (
    <div className="mt-5">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {mode !== "flashcards" && (
          <ChartLegend color="bg-primary" label="Testy" />
        )}
        {mode !== "test" && <ChartLegend color="bg-amber-500" label="Fiszki" />}
      </div>
      <svg
        viewBox="0 0 600 160"
        className="mt-4 h-40 w-full overflow-visible"
        role="img"
        aria-label="Wykres skuteczności ostatnich sesji"
      >
        {[25, 50, 75].map((value) => (
          <line
            key={value}
            x1="16"
            x2="584"
            y1={148 - value * 1.35}
            y2={148 - value * 1.35}
            className="stroke-border"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {points.length > 1 && (
          <polyline
            fill="none"
            points={points.map((point) => `${point.x},${point.y}`).join(" ")}
            className="stroke-muted-foreground/40"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {points.map((point) => (
          <circle
            key={point.id}
            cx={point.x}
            cy={point.y}
            r="5"
            className={
              point.mode === "test" ? "fill-primary" : "fill-amber-500"
            }
            vectorEffect="non-scaling-stroke"
          >
            <title>
              {point.mode === "test" ? "Test" : "Fiszki"} ·{" "}
              {formatShortDate(point.date)} · {point.accuracy}%
            </title>
          </circle>
        ))}
      </svg>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{formatShortDate(visible[0].date)}</span>
        <span>{formatShortDate(visible.at(-1)!.date)}</span>
      </div>
    </div>
  );
}

function ReviewQualityChart({ data }: { data: StudyStatistics }) {
  const successful = data.summary.successful;
  const unsuccessful = Math.max(0, data.summary.answers - successful);
  const accuracy = data.summary.answers ? data.summary.accuracy : 0;
  return (
    <div className="mt-5 grid items-center gap-5 sm:grid-cols-[8rem_1fr] lg:grid-cols-1 xl:grid-cols-[8rem_1fr]">
      <div
        className="relative mx-auto grid size-28 place-items-center rounded-full"
        style={{
          background: `conic-gradient(var(--primary) ${accuracy}%, color-mix(in oklch, var(--destructive) 55%, transparent) 0)`,
        }}
        role="img"
        aria-label={`Skuteczność odpowiedzi ${accuracy}%`}
      >
        <div className="grid size-20 place-items-center rounded-full bg-background text-center">
          <div>
            <p className="text-xl font-semibold">{accuracy}%</p>
            <p className="text-[10px] text-muted-foreground">skuteczności</p>
          </div>
        </div>
      </div>
      <div className="space-y-3 text-sm">
        <QualityRow
          color="bg-primary"
          label="Poprawne / zapamiętane"
          value={successful}
        />
        <QualityRow
          color="bg-destructive/60"
          label="Błędne / zapomniane"
          value={unsuccessful}
        />
      </div>
    </div>
  );
}

function QualityRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`size-2.5 rounded-full ${color}`} />
      <span className="min-w-0 flex-1 text-muted-foreground">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ChartLegend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${color}`} /> {label}
    </span>
  );
}

function AreasTable({ data }: { data: StudyStatistics }) {
  return (
    <section className="overflow-hidden rounded-2xl border">
      <div className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Wyniki powtórek według tematu</h2>
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
        <h2 className="text-lg font-semibold">Wyniki powtórek według modułu</h2>
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

function getPercent(completed: number, total: number) {
  return total ? Math.round((completed * 100) / total) : 0;
}
