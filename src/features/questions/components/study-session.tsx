import { Eye, ThumbsDown, ThumbsUp } from "lucide-react";
import type { StudySession as Session, StudyResult } from "../model/types";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { LoadError } from "@/components/load-error";
import { Progress } from "@/components/ui/progress";
import type { QuestionsRepository } from "../data/questions-repository";
import { toast } from "@/components/ui/toast";
import { useAsyncResource } from "@/hooks/use-async-resource";

type Props = {
  sessionId: string;
  repository: QuestionsRepository;
  onClose: () => void;
  onCloseLabel?: string;
  timeLimitMinutes?: number;
};
export function StudySession({
  sessionId,
  repository,
  onClose,
  onCloseLabel = "Wróć do bazy pytań",
  timeLimitMinutes,
}: Props) {
  const load = useCallback(
    () => repository.getSession(sessionId),
    [repository, sessionId],
  );
  const resource = useAsyncResource(load);
  if (resource.failed)
    return (
      <LoadError
        message="Nie udało się pobrać sesji."
        onRetry={resource.retry}
        onBack={onClose}
      />
    );
  if (resource.loading || !resource.value)
    return (
      <main className="grid flex-1 place-items-center">Ładowanie sesji…</main>
    );
  const data = resource.value;
  if (
    !data.items.length ||
    data.items.some((item) => !item.options.some((option) => option.isCorrect))
  ) {
    return (
      <LoadError
        message="Sesja nie zawiera poprawnych pytań."
        onBack={onClose}
      />
    );
  }
  return (
    <LoadedStudySession
      key={sessionId}
      initialSession={data}
      repository={repository}
      onClose={onClose}
      onCloseLabel={onCloseLabel}
      timeLimitMinutes={timeLimitMinutes}
    />
  );
}

function LoadedStudySession({
  initialSession,
  repository,
  onClose,
  onCloseLabel,
  timeLimitMinutes,
}: Omit<Props, "sessionId"> & { initialSession: Session }) {
  const [session, setSession] = useState(initialSession);
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      initialSession.items.findIndex((item) => !item.result),
    ),
  );
  const [readyToFinish, setReadyToFinish] = useState(() =>
    initialSession.items.every((item) => item.result !== null),
  );
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [timeExpired, setTimeExpired] = useState(false);
  const deadline = useRef<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(
    timeLimitMinutes ? timeLimitMinutes * 60 : null,
  );
  const timer = useRef({ itemId: "", elapsedMs: 0, startedAt: 0 });
  const currentItemId = session.items[index]?.id ?? "";

  useEffect(() => {
    if (!timeLimitMinutes || session.status !== "in_progress") return;
    deadline.current ??= Date.now() + timeLimitMinutes * 60_000;
    const updateRemaining = () => {
      const remaining = Math.max(
        0,
        Math.ceil((deadline.current! - Date.now()) / 1000),
      );
      setRemainingSeconds(remaining);
      if (remaining === 0) {
        setTimeExpired(true);
        setReadyToFinish(true);
      }
    };
    updateRemaining();
    const interval = window.setInterval(updateRemaining, 1_000);
    return () => window.clearInterval(interval);
  }, [session.status, timeLimitMinutes]);

  useEffect(() => {
    timer.current = {
      itemId: currentItemId,
      elapsedMs: 0,
      startedAt: document.visibilityState === "visible" ? performance.now() : 0,
    };
    const handleVisibility = () => {
      const current = timer.current;
      if (document.visibilityState === "hidden" && current.startedAt) {
        current.elapsedMs += performance.now() - current.startedAt;
        current.startedAt = 0;
      } else if (document.visibilityState === "visible" && !current.startedAt) {
        current.startedAt = performance.now();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [currentItemId]);

  function activeSeconds() {
    const current = timer.current;
    const live = current.startedAt ? performance.now() - current.startedAt : 0;
    return Math.max(1, Math.round((current.elapsedMs + live) / 1000));
  }
  async function finish() {
    if (saving) return;
    setSaving(true);
    try {
      await repository.completeSession(session.id);
      setSession((current) => ({ ...current, status: "completed" }));
    } catch {
      toast.add({
        data: { type: "error" },
        description: "Nie udało się zakończyć sesji. Spróbuj ponownie.",
      });
    } finally {
      setSaving(false);
    }
  }
  const record = useCallback(
    async (result: StudyResult, selectedOptionId?: string) => {
      if (!session || saving) return;
      const item = session.items[index];
      setSaving(true);
      try {
        await repository.answerItem(
          item.id,
          result,
          selectedOptionId,
          activeSeconds(),
        );
        const items = session.items.map((entry) =>
          entry.id === item.id
            ? { ...entry, result, selectedOptionId: selectedOptionId ?? null }
            : entry,
        );
        setSession({ ...session, items });
        const next = items.findIndex((entry) => entry.result === null);
        if (next < 0) setReadyToFinish(true);
        else {
          setIndex(next);
          setRevealed(false);
        }
      } catch {
        toast.add({
          data: { type: "error" },
          description: "Nie udało się zapisać odpowiedzi.",
        });
      } finally {
        setSaving(false);
      }
    },
    [index, repository, saving, session],
  );
  const successful = session.items.filter(
    (item) => item.result === "remembered" || item.result === "correct",
  ).length;
  const failed = session.items.filter(
    (item) => item.result === "forgotten" || item.result === "incorrect",
  ).length;
  const answered = successful + failed;
  if (session.status === "completed")
    return (
      <main className="grid flex-1 place-items-center p-5">
        <div className="w-full max-w-xl rounded-2xl border p-8 text-center">
          <h1 className="text-3xl font-semibold">Sesja ukończona</h1>
          <p className="mt-3 text-muted-foreground">
            Wynik: {successful} z {answered}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-primary/10 p-4">
              <p className="text-2xl font-semibold">{successful}</p>
              <p className="text-sm">
                {session.mode === "test" ? "Poprawne" : "Pamiętam"}
              </p>
            </div>
            <div className="rounded-xl bg-muted p-4">
              <p className="text-2xl font-semibold">{failed}</p>
              <p className="text-sm">
                {session.mode === "test" ? "Błędne" : "Nie pamiętam"}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Aktywna nauka:{" "}
            {formatDuration(
              session.items.reduce(
                (total, item) => total + item.activeDurationSeconds,
                0,
              ),
            )}
          </p>
          <Button className="mt-6" onClick={onClose}>
            {onCloseLabel}
          </Button>
        </div>
      </main>
    );
  if (session.status === "abandoned")
    return <LoadError message="Ta sesja została przerwana." onBack={onClose} />;
  if (readyToFinish)
    return (
      <main className="grid flex-1 place-items-center p-8">
        <div className="space-y-4 text-center">
          <h1 className="text-2xl font-semibold">
            {timeExpired ? "10 minut minęło" : "Wszystkie odpowiedzi zapisane"}
          </h1>
          <p>
            {timeExpired
              ? "Zakończ sesję i zobacz krótkie podsumowanie."
              : "Zakończ sesję, aby zobaczyć podsumowanie."}
          </p>
          <Button disabled={saving} onClick={() => void finish()}>
            {saving ? "Zapisywanie…" : "Zakończ sesję"}
          </Button>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Wróć do bazy pytań
          </Button>
        </div>
      </main>
    );
  const item = session.items[index];
  const correct = item.options.find((option) => option.isCorrect)!;
  async function choose(optionId: string) {
    if (revealed || saving) return;
    const isCorrect = correct.id === optionId;
    const result = isCorrect ? "correct" : "incorrect";

    setRevealed(true);
    setSaving(true);
    setSession((current) =>
      current
        ? {
            ...current,
            items: current.items.map((entry) =>
              entry.id === item.id
                ? { ...entry, selectedOptionId: optionId, result }
                : entry,
            ),
          }
        : current,
    );

    try {
      await repository.answerItem(item.id, result, optionId, activeSeconds());
    } catch {
      setRevealed(false);
      setSession((current) =>
        current
          ? {
              ...current,
              items: current.items.map((entry) =>
                entry.id === item.id
                  ? { ...entry, selectedOptionId: null, result: null }
                  : entry,
              ),
            }
          : current,
      );
      toast.add({
        data: { type: "error" },
        description: "Nie udało się zapisać odpowiedzi.",
      });
    } finally {
      setSaving(false);
    }
  }

  function advanceTest() {
    if (!item.result || saving) return;
    const next = session.items.findIndex((entry) => entry.result === null);
    if (next < 0) setReadyToFinish(true);
    else {
      setIndex(next);
      setRevealed(false);
    }
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex justify-between text-sm text-muted-foreground">
          <span>
            Pytanie {index + 1} z {session.items.length}
          </span>
          <span>
            {remainingSeconds === null
              ? session.mode === "test"
                ? "Test"
                : "Fiszki"
              : `Pozostało ${formatCountdown(remainingSeconds)}`}
          </span>
        </div>
        <Progress value={((index + 1) / session.items.length) * 100} />
        <section className="mt-8 rounded-2xl border p-8 text-center">
          <h1 className="text-2xl font-semibold sm:text-3xl">
            {item.question}
          </h1>
          {session.mode === "test" ? (
            <div className="mt-8 space-y-2 text-left">
              {item.options.map((option, optionIndex) => {
                const selected = item.selectedOptionId === option.id;
                const state =
                  revealed && option.isCorrect
                    ? "border-primary bg-primary/10"
                    : revealed && selected
                      ? "border-destructive bg-destructive/10"
                      : "";
                return (
                  <button
                    key={option.id}
                    disabled={revealed || saving}
                    className={`w-full rounded-xl border p-4 text-left ${state}`}
                    onClick={() => void choose(option.id)}
                  >
                    {String.fromCharCode(65 + optionIndex)}. {option.content}
                  </button>
                );
              })}
            </div>
          ) : revealed ? (
            <div className="mt-10 border-t pt-8">
              <p className="text-sm text-muted-foreground">
                Poprawna odpowiedź
              </p>
              <p className="mt-2 text-lg">{correct.content}</p>
            </div>
          ) : (
            <Button
              className="mt-10"
              variant="outline"
              onClick={() => setRevealed(true)}
            >
              <Eye /> Pokaż odpowiedź
            </Button>
          )}
          {revealed && item.explanation && (
            <div className="mt-6 rounded-xl bg-muted p-4 text-left">
              <p className="text-sm font-medium">Wyjaśnienie</p>
              <p className="mt-2 whitespace-pre-wrap text-sm">
                {item.explanation}
              </p>
            </div>
          )}
        </section>
        {revealed &&
          (session.mode === "flashcards" ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button
                size="lg"
                variant="outline"
                disabled={saving}
                onClick={() => void record("forgotten")}
              >
                <ThumbsDown /> Nie pamiętam
              </Button>
              <Button
                size="lg"
                disabled={saving}
                onClick={() => void record("remembered")}
              >
                <ThumbsUp /> Pamiętam
              </Button>
            </div>
          ) : (
            <Button
              className="mt-4 w-full"
              size="lg"
              disabled={!item.result || saving}
              onClick={() => void advanceTest()}
            >
              Następne pytanie
            </Button>
          ))}
      </div>
    </main>
  );
}

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
