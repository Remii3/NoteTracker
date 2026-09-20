import { AlertTriangle, CalendarRange, Clock3 } from "lucide-react";
import { pl } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useMemo, useState, type ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import type { ExamCalendar } from "../model/types";
import { SupabaseExamPlansRepository } from "../data/supabase-exam-plans-repository";
import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toast";
import { useNavigate } from "react-router";
import { useUser } from "@/features/auth";

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value: string, withYear = false) {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: withYear ? "numeric" : undefined,
  }).format(new Date(`${value}T12:00:00`));
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(dateFromKey(value));
}

function dateFromKey(value: string) {
  return new Date(`${value}T12:00:00`);
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function isInMonth(date: Date, month: Date) {
  return (
    date.getFullYear() === month.getFullYear() &&
    date.getMonth() === month.getMonth()
  );
}

type CalendarDay = ExamCalendar["days"][number];
type WorkloadDayButtonProps = ComponentProps<typeof CalendarDayButton> & {
  workload?: CalendarDay;
};

function WorkloadDayButton({
  day,
  modifiers,
  workload,
  ...props
}: WorkloadDayButtonProps) {
  const topicCount = workload?.topicIds.length ?? 0;
  const accessibleDetails = workload
    ? `, ${topicCount} ${topicCount === 1 ? "unikalny temat" : "unikalnych tematów"}, ${workload.reviewForecastLow}–${workload.reviewForecastHigh} powtórek${workload.isOverloaded ? ", konflikt limitu" : ""}`
    : ", brak zaplanowanego obciążenia";

  return (
    <CalendarDayButton
      day={day}
      modifiers={modifiers}
      {...props}
      aria-label={`${formatLongDate(dateKey(day.date))}${accessibleDetails}`}
      className={`min-w-0 items-start justify-start p-1.5 sm:p-2 ${
        workload?.isOverloaded
          ? "bg-destructive/10 text-destructive hover:bg-destructive/15"
          : workload
            ? "bg-primary/5 hover:bg-primary/10"
            : ""
      }`}
    >
      <span className="!text-sm font-medium !opacity-100">
        {day.date.getDate()}
      </span>
      {workload ? (
        <span className="mt-auto flex w-full items-center justify-between gap-1 !opacity-100">
          <span className="hidden truncate text-[0.65rem] text-muted-foreground sm:inline">
            {topicCount} {topicCount === 1 ? "temat" : "tematów"}
          </span>
          <span className="sm:hidden" aria-hidden="true">
            {topicCount}
          </span>
          {workload.isOverloaded ? (
            <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
          ) : (
            <span
              className="size-1.5 shrink-0 rounded-full bg-primary"
              aria-hidden="true"
            />
          )}
        </span>
      ) : null}
    </CalendarDayButton>
  );
}

export function ExamCalendarPage() {
  const user = useUser();
  const navigate = useNavigate();
  const repository = useMemo(
    () => new SupabaseExamPlansRepository(supabase, user.id),
    [user.id],
  );
  const [calendar, setCalendar] = useState<ExamCalendar>();
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [today] = useState(todayKey);
  const [selectedDate, setSelectedDate] = useState(() => dateFromKey(today));
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(dateFromKey(today)),
  );

  useEffect(() => {
    let active = true;
    repository
      .getCalendar(today)
      .then((result) => active && setCalendar(result))
      .catch(() => {
        if (active) setLoadError(true);
        toast.add({
          data: { type: "error" },
          description: "Nie udało się pobrać kalendarza egzaminów.",
        });
      });
    return () => {
      active = false;
    };
  }, [reloadKey, repository, today]);

  const daysByDate = useMemo(
    () => new Map(calendar?.days.map((day) => [day.date, day]) ?? []),
    [calendar],
  );
  const plansById = useMemo(
    () => new Map(calendar?.plans.map((plan) => [plan.id, plan]) ?? []),
    [calendar],
  );
  const selectedDateKey = dateKey(selectedDate);
  const selectedDay = daysByDate.get(selectedDateKey);
  const selectedPlans =
    selectedDay?.planIds.flatMap((planId) => {
      const plan = plansById.get(planId);
      return plan ? [plan] : [];
    }) ?? [];
  const lastCalendarMonth = useMemo(() => {
    const dates = [
      dateFromKey(today),
      ...(calendar?.plans.map((plan) => dateFromKey(plan.examDate)) ?? []),
      ...(calendar?.days.map((day) => dateFromKey(day.date)) ?? []),
    ];
    return startOfMonth(
      dates.reduce((latest, date) => (date > latest ? date : latest)),
    );
  }, [calendar, today]);
  const calendarComponents = useMemo(
    () => ({
      DayButton: (props: ComponentProps<typeof CalendarDayButton>) => (
        <WorkloadDayButton
          {...props}
          workload={daysByDate.get(dateKey(props.day.date))}
        />
      ),
    }),
    [daysByDate],
  );

  function handleMonthChange(month: Date) {
    setVisibleMonth(month);
    if (isInMonth(selectedDate, month)) return;
    const firstScheduledDay = calendar?.days.find((day) =>
      isInMonth(dateFromKey(day.date), month),
    );
    setSelectedDate(
      firstScheduledDay ? dateFromKey(firstScheduledDay.date) : month,
    );
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Kalendarz egzaminów
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Wspólne tematy są liczone raz, nawet gdy należą do kilku planów.
          </p>
        </div>

        {loadError ? (
          <Card role="alert">
            <CardContent className="items-start py-6">
              <p className="font-medium">
                Nie udało się pobrać kalendarza egzaminów.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setCalendar(undefined);
                  setLoadError(false);
                  setReloadKey((value) => value + 1);
                }}
              >
                Spróbuj ponownie
              </Button>
            </CardContent>
          </Card>
        ) : !calendar ? (
          <p className="text-sm text-muted-foreground">Ładowanie kalendarza…</p>
        ) : !calendar.plans.length ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CalendarRange className="mx-auto mb-3 size-8 text-muted-foreground" />
              <p className="font-medium">
                Nie masz jeszcze aktywnych egzaminów
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Termin dodasz w widoku wybranego modułu.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <section aria-labelledby="deadlines-heading">
              <h2 id="deadlines-heading" className="mb-3 text-lg font-semibold">
                Najbliższe terminy
              </h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {calendar.plans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    className="rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() =>
                      navigate(`/${plan.moduleSlug}/exams/${plan.id}`, {
                        state: { moduleId: plan.moduleId },
                      })
                    }
                  >
                    <Card className="h-full cursor-pointer hover:border-primary/40">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{plan.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm">
                        <p>{plan.moduleName}</p>
                        <p className="mt-1 text-muted-foreground">
                          {formatDate(plan.examDate, true)}
                        </p>
                      </CardContent>
                    </Card>
                  </button>
                ))}
              </div>
            </section>

            <section aria-labelledby="schedule-heading">
              <h2 id="schedule-heading" className="mb-3 text-lg font-semibold">
                Połączone obciążenie
              </h2>
              <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
                <Card>
                  <CardContent className="px-3 sm:px-6">
                    <Calendar
                      mode="single"
                      locale={pl}
                      month={visibleMonth}
                      selected={selectedDate}
                      onMonthChange={handleMonthChange}
                      onSelect={(date) => date && setSelectedDate(date)}
                      startMonth={startOfMonth(dateFromKey(today))}
                      endMonth={lastCalendarMonth}
                      disabled={{ before: dateFromKey(today) }}
                      components={calendarComponents}
                      className="w-full p-0 [--cell-size:2.25rem] sm:[--cell-size:4.5rem] xl:[--cell-size:5.5rem]"
                      classNames={{
                        root: "w-full",
                        months: "w-full",
                        month: "w-full",
                        month_grid: "w-full",
                      }}
                    />
                    <div
                      className="flex flex-wrap gap-x-5 gap-y-2 border-t pt-3 text-xs text-muted-foreground"
                      aria-label="Legenda kalendarza"
                    >
                      <span className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-primary" />
                        Zaplanowana nauka
                      </span>
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="size-3.5 text-destructive" />
                        Konflikt dziennego limitu
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="lg:sticky lg:top-6">
                  <CardHeader>
                    <CardTitle className="capitalize">
                      {formatLongDate(selectedDateKey)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedDay ? (
                      <>
                        {selectedDay.isOverloaded ? (
                          <div
                            className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
                            role="status"
                          >
                            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                            Co najmniej jeden plan przekracza dzienny limit.
                          </div>
                        ) : null}

                        <dl className="grid grid-cols-2 gap-3">
                          <div className="rounded-lg bg-muted/50 p-3">
                            <dt className="text-xs text-muted-foreground">
                              Unikalne tematy
                            </dt>
                            <dd className="mt-1 text-xl font-semibold">
                              {selectedDay.topicIds.length}
                            </dd>
                          </div>
                          <div className="rounded-lg bg-muted/50 p-3">
                            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock3 className="size-3.5" /> Powtórki
                            </dt>
                            <dd className="mt-1 text-xl font-semibold">
                              {selectedDay.reviewForecastLow}–
                              {selectedDay.reviewForecastHigh}
                            </dd>
                          </div>
                        </dl>

                        <div>
                          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Plany ({selectedPlans.length})
                          </p>
                          <div className="space-y-2">
                            {selectedPlans.map((plan) => (
                              <Button
                                key={plan.id}
                                type="button"
                                variant="outline"
                                className="h-auto w-full justify-start px-3 py-2 text-left"
                                onClick={() =>
                                  navigate(
                                    `/${plan.moduleSlug}/exams/${plan.id}`,
                                    {
                                      state: { moduleId: plan.moduleId },
                                    },
                                  )
                                }
                              >
                                <span className="min-w-0">
                                  <span className="block truncate font-medium">
                                    {plan.name}
                                  </span>
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {plan.moduleName} · egzamin{" "}
                                    {formatDate(plan.examDate, true)}
                                  </span>
                                </span>
                              </Button>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="py-8 text-center">
                        <CalendarRange className="mx-auto mb-3 size-7 text-muted-foreground" />
                        <p className="font-medium">Brak zaplanowanej nauki</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Wybierz oznaczony dzień, aby zobaczyć obciążenie.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
