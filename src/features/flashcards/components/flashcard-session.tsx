import { Eye, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { FlashcardsRepository } from "../data/flashcards-repository";
import type {
  FlashcardResult,
  FlashcardSession as Session,
} from "../model/types";

type Props = {
  sessionId: string;
  repository: FlashcardsRepository;
  onOpenSession: (id: string) => void;
  onClose: () => void;
};

export function FlashcardSession({
  sessionId,
  repository,
  onOpenSession,
  onClose,
}: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void repository
      .getSession(sessionId)
      .then((data) => {
        setSession(data);
        const unanswered = data.items.findIndex((item) => !item.result);
        setIndex(unanswered < 0 ? 0 : unanswered);
      })
      .catch(() => toast.error("Nie udało się pobrać sesji."));
  }, [repository, sessionId]);
  const answer = useCallback(
    async (result: FlashcardResult) => {
      if (!session || saving) return;
      const item = session.items[index];
      setSaving(true);
      try {
        await repository.answerItem(item.id, result);
        const items = session.items.map((current) =>
          current.id === item.id ? { ...current, result } : current,
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

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!session || session.status === "completed") return;
      if (event.code === "Space" && !revealed) {
        event.preventDefault();
        setRevealed(true);
      }
      if (revealed && event.key === "1") void answer("forgotten");
      if (revealed && event.key === "2") void answer("remembered");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [answer, revealed, session]);

  if (!session)
    return (
      <main className="grid min-h-0 flex-1 place-items-center text-sm text-muted-foreground">
        Ładowanie sesji…
      </main>
    );
  const remembered = session.items.filter(
    (item) => item.result === "remembered",
  ).length;
  const forgotten = session.items.filter(
    (item) => item.result === "forgotten",
  ).length;
  if (session.status === "completed")
    return (
      <main className="grid min-h-0 flex-1 place-items-center overflow-y-auto p-5">
        <div className="w-full max-w-xl rounded-2xl border p-8 text-center">
          <h1 className="text-3xl font-semibold">Sesja ukończona</h1>
          <p className="mt-3 text-muted-foreground">
            Pamiętasz {remembered} z {session.items.length} fiszek.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-primary/10 p-4">
              <p className="text-2xl font-semibold">{remembered}</p>
              <p className="text-sm">Pamiętam</p>
            </div>
            <div className="rounded-xl bg-muted p-4">
              <p className="text-2xl font-semibold">{forgotten}</p>
              <p className="text-sm">Nie pamiętam</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {forgotten > 0 && (
              <Button
                onClick={() =>
                  void repository
                    .retrySession(session.id)
                    .then(onOpenSession)
                    .catch(() =>
                      toast.error("Nie udało się utworzyć powtórki."),
                    )
                }
              >
                <RotateCcw /> Powtórz niezapamiętane
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>
              Zakończ
            </Button>
          </div>
        </div>
      </main>
    );
  const item = session.items[index];
  return (
    <main className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Fiszka {index + 1} z {session.items.length}
          </span>
          <span>Spacja: odpowiedź · 1/2: wynik</span>
        </div>
        <Progress value={((index + 1) / session.items.length) * 100} />
        <div className="mt-8 min-h-80 rounded-2xl border p-8 text-center sm:p-12">
          <p className="text-sm font-medium text-primary">Pytanie</p>
          <h1 className="mt-4 text-2xl font-semibold sm:text-3xl">
            {item.question}
          </h1>
          {revealed ? (
            <div className="mt-10 border-t pt-8">
              <p className="text-sm font-medium text-muted-foreground">
                Odpowiedź
              </p>
              <p className="mt-3 whitespace-pre-wrap text-lg">{item.answer}</p>
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
        </div>
        {revealed && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button
              size="lg"
              variant="outline"
              disabled={saving}
              onClick={() => void answer("forgotten")}
            >
              <ThumbsDown /> Nie pamiętam
            </Button>
            <Button
              size="lg"
              disabled={saving}
              onClick={() => void answer("remembered")}
            >
              <ThumbsUp /> Pamiętam
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
