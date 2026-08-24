import {
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Layers3,
  Play,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { QuestionsRepository } from "../data/questions-repository";
import type {
  StudyMode,
  StudySession,
  StudySessionSummary,
} from "../model/types";

const PAGE_SIZE = 20;

type Props = {
  repository: QuestionsRepository;
  onBack: () => void;
  onOpenSession: (mode: StudyMode, id: string) => void;
};

export function StudyHistoryPage({ repository, onBack, onOpenSession }: Props) {
  const [sessions, setSessions] = useState<StudySessionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [abandoning, setAbandoning] = useState<StudySessionSummary | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await repository.listSessions({
        offset: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
      setSessions(result.sessions);
      setTotal(result.total);
    } catch {
      toast.error("Nie udało się pobrać historii nauki.");
    } finally {
      setLoading(false);
    }
  }, [page, repository]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="mx-auto max-w-5xl">
        <Button variant="ghost" className="mb-5 -ml-3" onClick={onBack}>
          <ArrowLeft /> Baza pytań
        </Button>
        <div>
          <p className="mb-2 text-sm font-medium text-primary">Nauka</p>
          <h1 className="text-3xl font-semibold">Historia nauki</h1>
          <p className="mt-2 text-muted-foreground">
            Wyniki testów i sesji z fiszkami.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          {loading ? (
            Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-32 rounded-xl" />
            ))
          ) : sessions.length ? (
            sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onDetails={() => setDetailsId(session.id)}
                onResume={() => onOpenSession(session.mode, session.id)}
                onAbandon={() => setAbandoning(session)}
              />
            ))
          ) : (
            <div className="rounded-xl border border-dashed py-16 text-center">
              <p className="font-medium">Brak historii nauki</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ukończ test lub sesję z fiszkami, aby zobaczyć tutaj wynik.
              </p>
            </div>
          )}
        </div>

        {pages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Poprzednia
            </Button>
            <span className="text-sm text-muted-foreground">
              {page} / {pages}
            </span>
            <Button
              variant="outline"
              disabled={page === pages}
              onClick={() => setPage((value) => value + 1)}
            >
              Następna
            </Button>
          </div>
        )}
      </div>

      {detailsId && (
        <SessionDetails
          sessionId={detailsId}
          repository={repository}
          onClose={() => setDetailsId(null)}
        />
      )}

      <AlertDialog
        open={Boolean(abandoning)}
        onOpenChange={(open) => !open && setAbandoning(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Porzucić tę sesję?</AlertDialogTitle>
            <AlertDialogDescription>
              Zapisane odpowiedzi pozostaną w historii, ale tej sesji nie będzie
              już można wznowić.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!abandoning) return;
                void repository
                  .abandonSession(abandoning.id)
                  .then(() => {
                    setAbandoning(null);
                    toast.success("Sesja została oznaczona jako porzucona.");
                    void load();
                  })
                  .catch(() => toast.error("Nie udało się porzucić sesji."));
              }}
            >
              Porzuć sesję
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function SessionCard({
  session,
  onDetails,
  onResume,
  onAbandon,
}: {
  session: StudySessionSummary;
  onDetails: () => void;
  onResume: () => void;
  onAbandon: () => void;
}) {
  const percentage = session.totalCount
    ? Math.round((session.successfulCount / session.totalCount) * 100)
    : 0;
  const inProgress = session.status === "in_progress";

  return (
    <article className="rounded-xl border p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {session.mode === "test" ? (
              <BookOpenCheck className="size-5 text-primary" />
            ) : (
              <Layers3 className="size-5 text-primary" />
            )}
            <h2 className="font-semibold">
              {session.mode === "test" ? "Test" : "Fiszki"}
            </h2>
            <StatusBadge status={session.status} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {formatDate(session.startedAt)} ·{" "}
            {scopeLabel(session.configuration)}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <Progress
              className="max-w-sm"
              value={
                inProgress
                  ? (session.answeredCount / Math.max(1, session.totalCount)) *
                    100
                  : percentage
              }
            />
            <span className="shrink-0 text-sm font-medium">
              {inProgress
                ? `${session.answeredCount}/${session.totalCount}`
                : `${session.successfulCount}/${session.totalCount} (${percentage}%)`}
            </span>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock3 className="size-3.5" />
            {formatDuration(session.startedAt, session.completedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {inProgress && (
            <Button size="sm" onClick={onResume}>
              <Play /> Wznów
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onDetails}>
            Szczegóły
          </Button>
          {inProgress && (
            <Button variant="ghost" size="sm" onClick={onAbandon}>
              Porzuć
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function SessionDetails({
  sessionId,
  repository,
  onClose,
}: {
  sessionId: string;
  repository: QuestionsRepository;
  onClose: () => void;
}) {
  const [session, setSession] = useState<StudySession | null>(null);

  useEffect(() => {
    void repository
      .getSession(sessionId)
      .then(setSession)
      .catch(() => {
        toast.error("Nie udało się pobrać szczegółów sesji.");
        onClose();
      });
  }, [onClose, repository, sessionId]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[min(90dvh,56rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Szczegóły sesji</DialogTitle>
          <DialogDescription>
            {session
              ? `${session.mode === "test" ? "Test" : "Fiszki"} · ${formatDate(session.startedAt)}`
              : "Ładowanie odpowiedzi…"}
          </DialogDescription>
        </DialogHeader>
        {!session ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {session.items.map((item, index) => {
              const successful =
                item.result === "correct" || item.result === "remembered";
              const selected = item.options.find(
                (option) => option.id === item.selectedOptionId,
              );
              const correct = item.options.find((option) => option.isCorrect);
              return (
                <article key={item.id} className="rounded-xl border p-4">
                  <div className="flex gap-3">
                    {item.result ? (
                      successful ? (
                        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                      ) : (
                        <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
                      )
                    ) : (
                      <Clock3 className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium">
                        {index + 1}. {item.question}
                      </p>
                      {item.result ? (
                        <div className="mt-2 space-y-1 text-sm">
                          {session.mode === "test" && selected && (
                            <p>
                              Twoja odpowiedź:{" "}
                              <strong>{selected.content}</strong>
                            </p>
                          )}
                          {correct && (
                            <p className="text-muted-foreground">
                              Poprawna odpowiedź: {correct.content}
                            </p>
                          )}
                          {session.mode === "flashcards" && (
                            <p>{successful ? "Pamiętam" : "Nie pamiętam"}</p>
                          )}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Bez odpowiedzi
                        </p>
                      )}
                      {item.explanation && (
                        <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                          {item.explanation}
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: StudySessionSummary["status"] }) {
  const label =
    status === "completed"
      ? "Ukończona"
      : status === "in_progress"
        ? "W toku"
        : "Porzucona";
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {label}
    </span>
  );
}

function scopeLabel(configuration: Record<string, unknown>) {
  const scope = configuration.scope;
  if (scope === "chapter") return "wybrany rozdział";
  if (scope === "topic") return "wybrany temat";
  if (scope === "random_chapters") return "losowe rozdziały";
  if (scope === "unassigned") return "nieprzypisane";
  return "wszystkie pytania";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDuration(startedAt: string, completedAt: string | null) {
  if (!completedAt) return "Sesja nadal trwa";
  const durationMinutes = Math.max(
    1,
    Math.round(
      (new Date(completedAt).getTime() - new Date(startedAt).getTime()) /
        60_000,
    ),
  );
  if (durationMinutes < 60) return `${durationMinutes} min`;
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return minutes ? `${hours} godz. ${minutes} min` : `${hours} godz.`;
}
