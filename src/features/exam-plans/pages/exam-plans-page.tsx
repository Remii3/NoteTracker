import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { useUser } from "@/features/auth";
import { useModuleContext } from "@/features/notes/components/module-context";
import { supabase } from "@/lib/supabase/client";
import { SupabaseExamPlansRepository } from "../data/supabase-exam-plans-repository";
import { buildOverloadSuggestions } from "../domain/overload-suggestions";
import { generateExamPlan } from "../domain/plan-generator";
import type { ExamPlan, ExamPlanDetails } from "../model/types";

const WEEKDAYS = [
  { value: 1, short: "Pn" },
  { value: 2, short: "Wt" },
  { value: 3, short: "Śr" },
  { value: 4, short: "Cz" },
  { value: 5, short: "Pt" },
  { value: 6, short: "So" },
  { value: 0, short: "Nd" },
] as const;

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T12:00:00`));
}

export function ExamPlansPage() {
  const { examPlanId } = useParams<{ examPlanId?: string }>();
  return examPlanId ? <ExamTimeline planId={examPlanId} /> : <ExamPlanList />;
}

function useExamRepository() {
  const user = useUser();
  return useMemo(
    () => new SupabaseExamPlansRepository(supabase, user.id),
    [user.id],
  );
}

function ExamPlanList() {
  const { moduleId, moduleName } = useModuleContext();
  const repository = useExamRepository();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<ExamPlan[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [today] = useState(localDate);

  useEffect(() => {
    let active = true;
    repository
      .list(moduleId)
      .then((result) => active && setPlans(result))
      .catch(() => {
        if (active) setLoadError(true);
        toast.add({
          data: { type: "error" },
          description: "Nie udało się pobrać terminów egzaminów.",
        });
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [moduleId, reloadKey, repository]);

  if (showBuilder)
    return (
      <ExamPlanBuilder
        onCancel={() => setShowBuilder(false)}
        onSaved={(id) => navigate(id)}
      />
    );

  return (
    <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{moduleName}</p>
            <h1 className="text-2xl font-semibold tracking-tight">
              Terminy i plany egzaminów
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Każdy egzamin może obejmować inny, także nakładający się zakres.
            </p>
          </div>
          <Button onClick={() => setShowBuilder(true)}>
            <Plus /> Dodaj termin
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Ładowanie planów…</p>
        ) : loadError ? (
          <LoadError
            message="Nie udało się pobrać terminów egzaminów."
            onRetry={() => {
              setLoading(true);
              setLoadError(false);
              setReloadKey((value) => value + 1);
            }}
          />
        ) : plans.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {plans.map((plan) => {
              const days = Math.max(
                0,
                Math.ceil(
                  (new Date(`${plan.examDate}T00:00:00`).getTime() -
                    new Date(`${today}T00:00:00`).getTime()) /
                    86_400_000,
                ),
              );
              return (
                <button
                  key={plan.id}
                  type="button"
                  className="rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => navigate(plan.id)}
                >
                  <Card className="h-full cursor-pointer transition-colors hover:border-primary/40">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CalendarDays className="size-5 text-primary" />
                        {plan.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p className="font-medium">
                        {new Intl.DateTimeFormat("pl-PL", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        }).format(new Date(`${plan.examDate}T12:00:00`))}
                      </p>
                      <p className="text-muted-foreground">
                        {days === 0
                          ? "Termin minął lub jest dziś"
                          : `Pozostało ${days} dni`}
                        {" · "}cel {Math.round(plan.targetRetention * 100)}%
                      </p>
                    </CardContent>
                  </Card>
                </button>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <CalendarDays className="mx-auto mb-3 size-8 text-muted-foreground" />
              <p className="font-medium">Brak terminów dla tego modułu</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Dodaj egzamin, aby aplikacja rozłożyła materiał i powtórki.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

function ExamPlanBuilder({
  onCancel,
  onSaved,
  initialDetails,
}: {
  onCancel: () => void;
  onSaved: (id: string) => void;
  initialDetails?: ExamPlanDetails;
}) {
  const { moduleId, moduleName } = useModuleContext();
  const repository = useExamRepository();
  const [name, setName] = useState(
    initialDetails?.plan.name ?? `Egzamin — ${moduleName ?? "moduł"}`,
  );
  const [examDate, setExamDate] = useState(
    initialDetails?.plan.examDate ?? localDate(28),
  );
  const [targetRetention, setTargetRetention] = useState(
    Math.round((initialDetails?.plan.targetRetention ?? 0.9) * 100),
  );
  const [weekdays, setWeekdays] = useState<number[]>(
    initialDetails?.plan.studyWeekdays ?? [1, 2, 3, 4, 5],
  );
  const [bufferPercent, setBufferPercent] = useState(
    initialDetails?.plan.bufferPercent ?? 10,
  );
  const [limitMode, setLimitMode] = useState<"questions" | "minutes">(
    initialDetails?.plan.dailyTimeLimitMinutes !== null
      ? "minutes"
      : "questions",
  );
  const [limit, setLimit] = useState(
    initialDetails?.plan.dailyTimeLimitMinutes ??
      initialDetails?.plan.dailyQuestionLimit ??
      32,
  );
  const [includeUnassigned, setIncludeUnassigned] = useState(
    initialDetails?.plan.includeUnassignedQuestions ?? false,
  );
  const [material, setMaterial] = useState<
    Awaited<ReturnType<typeof repository.getPlanningMaterial>> | undefined
  >();
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(() =>
    initialDetails ? new Set(initialDetails.scopeTopicIds) : null,
  );
  const [workloads, setWorkloads] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      initialDetails?.topics.map((topic) => [topic.id, topic.workloadPoints]) ??
        [],
    ),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    repository
      .getPlanningMaterial(moduleId)
      .then((result) => {
        if (!active) return;
        setMaterial(result);
        setWorkloads((current) => ({
          ...Object.fromEntries(
            result.topics.map((topic) => [topic.id, topic.workloadPoints]),
          ),
          ...current,
        }));
      })
      .catch(() =>
        toast.add({
          data: { type: "error" },
          description: "Nie udało się pobrać zakresu modułu.",
        }),
      );
    return () => {
      active = false;
    };
  }, [moduleId, repository]);

  const effectiveIds = useMemo(
    () =>
      selectedIds ?? new Set(material?.topics.map((topic) => topic.id) ?? []),
    [material, selectedIds],
  );
  const selectedTopics = useMemo(
    () =>
      (material?.topics ?? [])
        .filter((topic) => effectiveIds.has(topic.id))
        .map((topic) => ({
          ...topic,
          workloadPoints: workloads[topic.id] ?? topic.workloadPoints,
          workloadSource:
            workloads[topic.id] === topic.workloadPoints
              ? topic.workloadSource
              : ("manual" as const),
        })),
    [effectiveIds, material, workloads],
  );
  const generated = useMemo(
    () =>
      generateExamPlan({
        today: localDate(),
        examDate,
        studyWeekdays: weekdays,
        bufferPercent,
        targetRetention: targetRetention / 100,
        dailyQuestionLimit: limitMode === "questions" ? limit : null,
        dailyTimeLimitMinutes: limitMode === "minutes" ? limit : null,
        reviewSecondsPerQuestion: material?.reviewSecondsPerQuestion,
        topics: selectedTopics,
        unassignedQuestionCount: includeUnassigned
          ? material?.unassignedQuestionCount
          : 0,
        unassignedDueReviewCount: includeUnassigned
          ? material?.unassignedDueReviewCount
          : 0,
        unassignedReviewDueDates: includeUnassigned
          ? material?.unassignedReviewDueDates
          : [],
        lockedAssignments: initialDetails?.days
          .flatMap((day) => day.assignments)
          .filter(
            (assignment) =>
              assignment.isLocked && assignment.scheduledFor >= localDate(),
          ),
      }),
    [
      bufferPercent,
      examDate,
      includeUnassigned,
      initialDetails,
      limit,
      limitMode,
      material,
      selectedTopics,
      targetRetention,
      weekdays,
    ],
  );
  const overloadSuggestions = useMemo(
    () =>
      buildOverloadSuggestions(
        {
          studyWeekdays: weekdays,
          dailyQuestionLimit: limitMode === "questions" ? limit : null,
          dailyTimeLimitMinutes: limitMode === "minutes" ? limit : null,
        },
        generated.days,
        selectedTopics.length,
      ),
    [generated.days, limit, limitMode, selectedTopics.length, weekdays],
  );

  function toggleTopic(id: string, checked: boolean) {
    const next = new Set(effectiveIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  }

  async function save() {
    if (!name.trim() || !selectedTopics.length || !generated.days.length) {
      toast.add({
        data: { type: "error" },
        description:
          "Uzupełnij nazwę, termin i wybierz co najmniej jeden temat.",
      });
      return;
    }
    setSaving(true);
    try {
      const historicalDays = (initialDetails?.days ?? [])
        .filter((day) => day.date < localDate())
        .map((day) => ({
          ...day,
          assignments: day.assignments.filter(
            (assignment) =>
              assignment.completedAt !== null ||
              initialDetails?.topics.find(
                (topic) => topic.id === assignment.topicId,
              )?.completed,
          ),
        }))
        .map((day) => ({
          ...day,
          workloadPoints: day.assignments.reduce(
            (sum, assignment) => sum + assignment.workloadPoints,
            0,
          ),
        }));
      const id = await repository.save({
        id: initialDetails?.plan.id,
        expectedPlanVersion: initialDetails?.plan.planVersion,
        rebuiltOn: localDate(),
        moduleId,
        name: name.trim(),
        examDate,
        targetRetention: targetRetention / 100,
        studyWeekdays: weekdays,
        dailyTimeLimitMinutes: limitMode === "minutes" ? limit : null,
        dailyQuestionLimit: limitMode === "questions" ? limit : null,
        bufferPercent,
        includeUnassignedQuestions: includeUnassigned,
        topicSettings: selectedTopics,
        days: [...historicalDays, ...generated.days],
      });
      await repository.rebuildAdaptivePlans(undefined, true);
      toast.add({
        data: { type: "success" },
        description: "Plan egzaminu został zapisany.",
      });
      onSaved(id);
    } catch (error) {
      toast.add({
        data: { type: "error" },
        description:
          error instanceof Error
            ? error.message
            : "Nie udało się zapisać planu egzaminu.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <ArrowLeft />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">
              {initialDetails ? "Edytuj plan egzaminu" : "Nowy plan egzaminu"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Podgląd aktualizuje się po każdej zmianie.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Termin i tempo</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="exam-name">Nazwa egzaminu</Label>
                  <Input
                    id="exam-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exam-date">Data egzaminu</Label>
                  <Input
                    id="exam-date"
                    type="date"
                    min={localDate(1)}
                    value={examDate}
                    onChange={(event) => setExamDate(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="retention">Oczekiwane opanowanie (%)</Label>
                  <Input
                    id="retention"
                    type="number"
                    min={70}
                    max={99}
                    value={targetRetention}
                    onChange={(event) =>
                      setTargetRetention(Number(event.target.value))
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Dni nauki</Label>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((day) => (
                      <Button
                        key={day.value}
                        type="button"
                        size="sm"
                        variant={
                          weekdays.includes(day.value) ? "default" : "outline"
                        }
                        onClick={() =>
                          setWeekdays((current) =>
                            current.includes(day.value)
                              ? current.length === 1
                                ? current
                                : current.filter((value) => value !== day.value)
                              : [...current, day.value],
                          )
                        }
                      >
                        {day.short}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="limit-mode">Dzienny limit</Label>
                  <select
                    id="limit-mode"
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={limitMode}
                    onChange={(event) =>
                      setLimitMode(
                        event.target.value as "questions" | "minutes",
                      )
                    }
                  >
                    <option value="questions">pytań</option>
                    <option value="minutes">minut</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="limit">Wartość limitu</Label>
                  <Input
                    id="limit"
                    type="number"
                    min={limitMode === "minutes" ? 5 : 1}
                    value={limit}
                    onChange={(event) => setLimit(Number(event.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buffer">Bufor przed egzaminem (%)</Label>
                  <Input
                    id="buffer"
                    type="number"
                    min={0}
                    max={30}
                    value={bufferPercent}
                    onChange={(event) =>
                      setBufferPercent(Number(event.target.value))
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Zakres ({selectedTopics.length} tematów)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setSelectedIds(
                        new Set(material?.topics.map((topic) => topic.id)),
                      )
                    }
                  >
                    Zaznacz wszystko
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Wyczyść
                  </Button>
                </div>
                {(material?.topics ?? []).map((topic) => (
                  <label
                    key={topic.id}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <Checkbox
                      checked={effectiveIds.has(topic.id)}
                      onCheckedChange={(checked) =>
                        toggleTopic(topic.id, checked === true)
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {topic.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {topic.chapterTitle}
                        {topic.completed ? " · ukończony" : ""}
                      </span>
                    </span>
                    <select
                      aria-label={`Ciężar tematu ${topic.title}`}
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                      value={workloads[topic.id] ?? topic.workloadPoints}
                      onChange={(event) =>
                        setWorkloads((current) => ({
                          ...current,
                          [topic.id]: Number(event.target.value),
                        }))
                      }
                    >
                      <option value={1}>krótki · 1</option>
                      <option value={2}>średni · 2</option>
                      <option value={4}>długi · 4</option>
                      <option value={6}>bardzo długi · 6</option>
                    </select>
                  </label>
                ))}
                {material?.unassignedQuestionCount ? (
                  <label className="flex items-center gap-3 rounded-lg border p-3">
                    <Checkbox
                      checked={includeUnassigned}
                      onCheckedChange={(checked) =>
                        setIncludeUnassigned(checked === true)
                      }
                    />
                    <span className="text-sm">
                      Pytania bez przypisanego tematu (
                      {material.unassignedQuestionCount})
                    </span>
                  </label>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <Card>
              <CardHeader>
                <CardTitle>Prognoza planu</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-lg font-medium">
                  Do egzaminu zostało {Math.max(0, generated.daysUntilExam)}{" "}
                  dni.
                </p>
                <p className="text-sm text-muted-foreground">
                  Realizuj średnio {generated.topicsPerDay} tematów i około{" "}
                  {generated.reviewForecastLow}–{generated.reviewForecastHigh}{" "}
                  powtórek w dzień nauki. Ostatnie {generated.bufferDays}{" "}
                  {generated.bufferDays === 1 ? "dzień jest" : "dni są"}{" "}
                  buforem.
                </p>
                <p className="text-xs text-muted-foreground">
                  Tempo powtórek: około{" "}
                  {material?.reviewSecondsPerQuestion ?? 45} s na pytanie
                  {material?.paceSampleSize
                    ? ` na podstawie ${material.paceSampleSize} odpowiedzi.`
                    : " — wstępna wartość, dopóki nie zbierzemy historii sesji."}
                </p>
                {generated.warnings.map((warning) => (
                  <div
                    key={warning}
                    className="flex gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    {warning}
                  </div>
                ))}
                {overloadSuggestions.length ? (
                  <section
                    aria-labelledby="overload-suggestions-title"
                    className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
                  >
                    <h2
                      id="overload-suggestions-title"
                      className="text-sm font-semibold"
                    >
                      Jak odciążyć plan
                    </h2>
                    <ul className="mt-2 space-y-2">
                      {overloadSuggestions.map((suggestion) => (
                        <li key={suggestion.id} className="text-xs">
                          <p className="font-medium">{suggestion.title}</p>
                          <p className="text-muted-foreground">
                            {suggestion.description}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
                  {generated.days.map((day) => (
                    <div
                      key={day.date}
                      className="rounded-md border p-3 text-sm"
                    >
                      <div className="flex justify-between gap-2 font-medium">
                        <span>{formatDate(day.date)}</span>
                        <span className="text-muted-foreground">
                          {day.isBufferDay
                            ? "bufor"
                            : `${day.assignments.length} tem.`}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Cel: {day.reviewTarget} powtórek · około{" "}
                        {day.estimatedMinutesLow}–{day.estimatedMinutesHigh} min
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={onCancel}
                  >
                    Anuluj
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={saving || !generated.days.length}
                    onClick={() => void save()}
                  >
                    {saving
                      ? "Zapisywanie…"
                      : initialDetails
                        ? "Zapisz zmiany"
                        : "Zapisz plan"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}

function ExamTimeline({ planId }: { planId: string }) {
  const repository = useExamRepository();
  const navigate = useNavigate();
  const [details, setDetails] = useState<ExamPlanDetails>();
  const [movingTopicId, setMovingTopicId] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    let active = true;
    repository
      .rebuildAdaptivePlans()
      .then(() => repository.get(planId))
      .then((result) => active && setDetails(result))
      .catch(() => {
        if (active) setLoadError(true);
        toast.add({
          data: { type: "error" },
          description: "Nie udało się pobrać planu egzaminu.",
        });
      });
    return () => {
      active = false;
    };
  }, [planId, reloadKey, repository]);

  if (loadError)
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <LoadError
          message="Nie udało się pobrać planu egzaminu."
          onRetry={() => {
            setDetails(undefined);
            setLoadError(false);
            setReloadKey((value) => value + 1);
          }}
        />
      </div>
    );
  if (!details)
    return (
      <p className="p-6 text-sm text-muted-foreground">Ładowanie planu…</p>
    );
  if (editing)
    return (
      <ExamPlanBuilder
        initialDetails={details}
        onCancel={() => setEditing(false)}
        onSaved={(id) => {
          repository
            .get(id)
            .then((result) => {
              setDetails(result);
              setEditing(false);
            })
            .catch(() =>
              toast.add({
                data: { type: "error" },
                description:
                  "Plan zapisano, ale nie udało się odświeżyć widoku.",
              }),
            );
        }}
      />
    );
  const topics = new Map(details.topics.map((topic) => [topic.id, topic]));
  const overloadSuggestions = buildOverloadSuggestions(
    details.plan,
    details.days,
    details.scopeTopicIds.length,
  );

  async function remove() {
    setRemoving(true);
    try {
      await repository.delete(planId);
      toast.add({
        data: { type: "success" },
        description: "Plan został trwale usunięty.",
      });
      navigate("../exams", { replace: true });
    } catch {
      toast.add({
        data: { type: "error" },
        description: "Nie udało się usunąć planu.",
      });
    } finally {
      setRemoving(false);
    }
  }

  async function moveTopic(topicId: string, targetDate: string) {
    setMovingTopicId(topicId);
    try {
      setDetails(await repository.moveAssignment(planId, topicId, targetDate));
      toast.add({
        data: { type: "success" },
        description: "Temat został przeniesiony i zablokowany w tym dniu.",
      });
    } catch (error) {
      toast.add({
        data: { type: "error" },
        description:
          error instanceof Error
            ? error.message
            : "Nie udało się przenieść tematu.",
      });
    } finally {
      setMovingTopicId(undefined);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const topicId = String(event.active.id).replace(/^topic:/, "");
    const targetDate = event.over
      ? String(event.over.id).replace(/^day:/, "")
      : undefined;
    if (
      !String(event.active.id).startsWith("topic:") ||
      !event.over ||
      !String(event.over.id).startsWith("day:") ||
      !targetDate ||
      event.active.data.current?.scheduledFor === targetDate
    )
      return;
    void moveTopic(topicId, targetDate);
  }

  return (
    <>
      <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("../exams")}
              >
                <ArrowLeft />
              </Button>
              <div>
                <h1 className="text-2xl font-semibold">{details.plan.name}</h1>
                <p className="text-sm text-muted-foreground">
                  Egzamin{" "}
                  {new Intl.DateTimeFormat("pl-PL", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  }).format(new Date(`${details.plan.examDate}T12:00:00`))}{" "}
                  · cel {Math.round(details.plan.targetRetention * 100)}%
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(true)}>
                Edytuj plan
              </Button>
              <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 /> Usuń plan
              </Button>
            </div>
          </div>

          {overloadSuggestions.length ? (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="size-4 text-amber-600" />
                  Plan wymaga odciążenia
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {overloadSuggestions.map((suggestion) => (
                    <li key={suggestion.id} className="text-sm">
                      <p className="font-medium">{suggestion.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {suggestion.description}
                      </p>
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-4"
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(true)}
                >
                  Dostosuj plan
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div className="space-y-3">
              {details.days.map((day) => (
                <DroppableTimelineDay
                  key={day.date}
                  date={day.date}
                  disabled={day.isBufferDay}
                >
                  <Card
                    className={
                      day.isOverloaded ? "border-destructive/50" : undefined
                    }
                  >
                    <CardContent className="py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">
                            {formatDate(day.date)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {day.isBufferDay
                              ? "Bufor: utrwalenie całego zakresu"
                              : `${day.workloadPoints} pkt obciążenia`}{" "}
                            · {day.reviewForecastLow}–{day.reviewForecastHigh}{" "}
                            prognozowanych powtórek · około{" "}
                            {day.estimatedMinutesLow}–{day.estimatedMinutesHigh}{" "}
                            min
                          </p>
                        </div>
                        {day.isOverloaded ? (
                          <span className="flex items-center gap-1 text-xs text-destructive">
                            <AlertTriangle className="size-4" /> Przekroczony
                            limit
                          </span>
                        ) : null}
                      </div>
                      {day.assignments.length ? (
                        <div className="mt-3 space-y-2">
                          {day.assignments.map((assignment) => {
                            const topic = topics.get(assignment.topicId);
                            const canMove =
                              !assignment.completedAt && !topic?.completed;
                            return (
                              <DraggableTimelineTopic
                                key={assignment.topicId}
                                topicId={assignment.topicId}
                                scheduledFor={day.date}
                                disabled={
                                  !canMove || movingTopicId !== undefined
                                }
                                label={topic?.title ?? "Usunięty temat"}
                              >
                                {assignment.completedAt || topic?.completed ? (
                                  <CheckCircle2 className="size-4 text-primary" />
                                ) : (
                                  <span className="size-4 rounded-full border" />
                                )}
                                <span className="min-w-0 flex-1 truncate">
                                  {topic?.title ?? "Usunięty temat"}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {assignment.workloadPoints} pkt
                                </span>
                                {canMove ? (
                                  <select
                                    aria-label={`Przenieś temat ${topic?.title ?? ""}`}
                                    className="h-8 max-w-36 rounded-md border bg-background px-2 text-xs"
                                    value={day.date}
                                    disabled={
                                      movingTopicId === assignment.topicId
                                    }
                                    onChange={(event) =>
                                      void moveTopic(
                                        assignment.topicId,
                                        event.target.value,
                                      )
                                    }
                                  >
                                    {details.days
                                      .filter((option) => !option.isBufferDay)
                                      .map((option) => (
                                        <option
                                          key={option.date}
                                          value={option.date}
                                        >
                                          {formatDate(option.date)}
                                        </option>
                                      ))}
                                  </select>
                                ) : null}
                              </DraggableTimelineTopic>
                            );
                          })}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </DroppableTimelineDay>
              ))}
            </div>
          </DndContext>
          <p className="text-xs text-muted-foreground">
            Przeciągnij temat na inny dzień albo użyj listy wyboru. Ręcznie
            przeniesiony temat pozostanie zablokowany podczas automatycznych
            aktualizacji planu.
          </p>
        </div>
      </main>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trwale usunąć plan?</AlertDialogTitle>
            <AlertDialogDescription>
              Plan „{details.plan.name}” i jego podział na dni zostaną usunięte
              natychmiast. Ta operacja pomija kosz i nie można jej cofnąć.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removing}
              onClick={() => void remove()}
            >
              {removing ? "Usuwanie…" : "Usuń trwale"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function LoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card role="alert">
      <CardContent className="items-start py-6">
        <p className="font-medium">{message}</p>
        <Button variant="outline" onClick={onRetry}>
          Spróbuj ponownie
        </Button>
      </CardContent>
    </Card>
  );
}

function DroppableTimelineDay({
  date,
  disabled,
  children,
}: {
  date: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `day:${date}`,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={
        isOver
          ? "rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background"
          : undefined
      }
    >
      {children}
    </div>
  );
}

function DraggableTimelineTopic({
  topicId,
  scheduledFor,
  disabled,
  label,
  children,
}: {
  topicId: string;
  scheduledFor: string;
  disabled: boolean;
  label: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `topic:${topicId}`,
      disabled,
      data: { scheduledFor },
    });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm ${isDragging ? "relative z-10 opacity-70 shadow-lg" : ""}`}
    >
      {!disabled ? (
        <button
          type="button"
          className="touch-none cursor-grab rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          aria-label={`Przeciągnij temat ${label}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      ) : null}
      {children}
    </div>
  );
}
