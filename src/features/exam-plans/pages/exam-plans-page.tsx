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
import { toast } from "@/components/ui/toast";
import { useUser } from "@/features/auth";
import { useModuleContext } from "@/features/notes/components/module-context";
import { supabase } from "@/lib/supabase/client";
import { ExamPlanBuilder } from "../components/exam-plan-builder";
import { SupabaseExamPlansRepository } from "../data/supabase-exam-plans-repository";
import { buildOverloadSuggestions } from "../domain/overload-suggestions";
import type { ExamPlan, ExamPlanDetails } from "../model/types";

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
