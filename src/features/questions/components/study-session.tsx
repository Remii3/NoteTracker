import { Eye, ThumbsDown, ThumbsUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { QuestionsRepository } from "../data/questions-repository";
import type { StudyResult, StudySession as Session } from "../model/types";

type Props = {
  sessionId: string;
  repository: QuestionsRepository;
  onClose: () => void;
};
export function StudySession({ sessionId, repository, onClose }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void repository
      .getSession(sessionId)
      .then((data) => {
        setSession(data);
        const next = data.items.findIndex((item) => !item.result);
        setIndex(next < 0 ? 0 : next);
      })
      .catch(() => toast.error("Nie udało się pobrać sesji."));
  }, [repository, sessionId]);
  const record = useCallback(
    async (result: StudyResult, selectedOptionId?: string) => {
      if (!session || saving) return;
      const item = session.items[index];
      setSaving(true);
      try {
        await repository.answerItem(item.id, result, selectedOptionId);
        const items = session.items.map((entry) =>
          entry.id === item.id
            ? { ...entry, result, selectedOptionId: selectedOptionId ?? null }
            : entry,
        );
        const last = index === items.length - 1;
        if (last) await repository.completeSession(session.id);
        setSession({
          ...session,
          status: last ? "completed" : session.status,
          items,
        });
        if (!last) {
          setIndex(index + 1);
          setRevealed(false);
        }
      } catch {
        toast.error("Nie udało się zapisać odpowiedzi.");
      } finally {
        setSaving(false);
      }
    },
    [index, repository, saving, session],
  );
  if (!session)
    return (
      <main className="grid flex-1 place-items-center text-sm text-muted-foreground">
        Ładowanie sesji…
      </main>
    );
  const successful = session.items.filter(
    (item) => item.result === "remembered" || item.result === "correct",
  ).length;
  const failed = session.items.filter(
    (item) => item.result === "forgotten" || item.result === "incorrect",
  ).length;
  if (session.status === "completed")
    return (
      <main className="grid flex-1 place-items-center p-5">
        <div className="w-full max-w-xl rounded-2xl border p-8 text-center">
          <h1 className="text-3xl font-semibold">Sesja ukończona</h1>
          <p className="mt-3 text-muted-foreground">
            Wynik: {successful} z {session.items.length}
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
          <Button className="mt-6" onClick={onClose}>
            Wróć do bazy pytań
          </Button>
        </div>
      </main>
    );
  const item = session.items[index];
  const correct = item.options.find((option) => option.isCorrect)!;
  function choose(optionId: string) {
    if (revealed || saving) return;
    const isCorrect = correct.id === optionId;
    setRevealed(true);
    void repository
      .answerItem(item.id, isCorrect ? "correct" : "incorrect", optionId)
      .then(() =>
        setSession((current) =>
          current
            ? {
                ...current,
                items: current.items.map((entry) =>
                  entry.id === item.id
                    ? {
                        ...entry,
                        selectedOptionId: optionId,
                        result: isCorrect ? "correct" : "incorrect",
                      }
                    : entry,
                ),
              }
            : current,
        ),
      )
      .catch(() => toast.error("Nie udało się zapisać odpowiedzi."));
  }
  return (
    <main className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex justify-between text-sm text-muted-foreground">
          <span>
            Pytanie {index + 1} z {session.items.length}
          </span>
          <span>{session.mode === "test" ? "Test" : "Fiszki"}</span>
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
                    disabled={revealed}
                    className={`w-full rounded-xl border p-4 text-left ${state}`}
                    onClick={() => choose(option.id)}
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
              onClick={() =>
                void record(
                  item.result ?? "incorrect",
                  item.selectedOptionId ?? undefined,
                )
              }
            >
              Następne pytanie
            </Button>
          ))}
      </div>
    </main>
  );
}
