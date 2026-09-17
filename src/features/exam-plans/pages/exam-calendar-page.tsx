import { AlertTriangle, CalendarRange, Clock3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { useUser } from "@/features/auth";
import { supabase } from "@/lib/supabase/client";
import { SupabaseExamPlansRepository } from "../data/supabase-exam-plans-repository";
import type { ExamCalendar } from "../model/types";

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
              <div className="space-y-3">
                {calendar.days.slice(0, 42).map((day) => (
                  <Card
                    key={day.date}
                    className={
                      day.isOverloaded ? "border-destructive/50" : undefined
                    }
                  >
                    <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4">
                      <p className="w-32 font-medium">{formatDate(day.date)}</p>
                      <p className="text-sm">
                        <strong>{day.topicIds.length}</strong> unikalnych
                        tematów
                      </p>
                      <p className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock3 className="size-4" /> {day.reviewForecastLow}–
                        {day.reviewForecastHigh} powtórek
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {day.planIds.length}{" "}
                        {day.planIds.length === 1 ? "plan" : "plany"}
                      </p>
                      {day.isOverloaded ? (
                        <span className="ml-auto flex items-center gap-1 text-xs text-destructive">
                          <AlertTriangle className="size-4" /> Konflikt limitu
                        </span>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
