import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { FlashcardsRepository } from "../data/flashcards-repository";
import type { Flashcard } from "../model/types";

type Props = {
  topicId: string;
  isEditing: boolean;
  repository?: FlashcardsRepository;
};

export function TopicFlashcardsSection({
  topicId,
  isEditing,
  repository,
}: Props) {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [edited, setEdited] = useState<Flashcard | null | undefined>();
  const load = useCallback(async () => {
    if (!repository) return;
    setLoading(true);
    try {
      setCards(await repository.listForTopic(topicId));
    } catch {
      toast.error("Nie udało się pobrać fiszek.");
    } finally {
      setLoading(false);
    }
  }, [repository, topicId]);

  useEffect(() => {
    if (!repository) return;
    let cancelled = false;
    void repository
      .listForTopic(topicId)
      .then((items) => {
        if (!cancelled) setCards(items);
      })
      .catch(() => toast.error("Nie udało się pobrać fiszek."))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repository, topicId]);
  if (!repository) return null;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Fiszki</h3>
          <p className="text-sm text-muted-foreground">
            {loading ? "Pobieranie…" : `${cards.length} fiszek w tym temacie`}
          </p>
        </div>
        {isEditing && (
          <Button type="button" size="sm" onClick={() => setEdited(null)}>
            <Plus /> Dodaj fiszkę
          </Button>
        )}
      </div>
      {!loading && cards.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Ten temat nie ma jeszcze fiszek.
        </div>
      ) : (
        <div className="space-y-2">
          {cards.map((card) => (
            <div key={card.id} className="rounded-xl border p-4">
              <p className="font-medium">{card.question}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {card.answer}
              </p>
              {isEditing && (
                <div className="mt-3 flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Edytuj fiszkę"
                    onClick={() => setEdited(card)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Usuń fiszkę"
                    onClick={() =>
                      void repository
                        .remove(card.id)
                        .then(() => {
                          setCards((items) =>
                            items.filter((item) => item.id !== card.id),
                          );
                          toast.success("Usunięto fiszkę.");
                        })
                        .catch(() =>
                          toast.error("Nie udało się usunąć fiszki."),
                        )
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {edited !== undefined && (
        <FlashcardDialog
          card={edited}
          onClose={() => setEdited(undefined)}
          onSave={async (question, answer) => {
            if (edited) await repository.update(edited.id, question, answer);
            else await repository.create(topicId, question, answer);
            await load();
            setEdited(undefined);
            toast.success(edited ? "Zapisano fiszkę." : "Dodano fiszkę.");
          }}
        />
      )}
    </section>
  );
}

function FlashcardDialog({
  card,
  onClose,
  onSave,
}: {
  card: Flashcard | null;
  onClose: () => void;
  onSave: (question: string, answer: string) => Promise<void>;
}) {
  const [question, setQuestion] = useState(card?.question ?? "");
  const [answer, setAnswer] = useState(card?.answer ?? "");
  const [saving, setSaving] = useState(false);
  const valid = Boolean(question.trim() && answer.trim());
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{card ? "Edytuj fiszkę" : "Dodaj fiszkę"}</DialogTitle>
          <DialogDescription>
            Dodaj pytanie i odpowiedź, którą odsłonisz podczas nauki.
          </DialogDescription>
        </DialogHeader>
        <label className="space-y-2">
          <span className="font-medium">Pytanie</span>
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        <label className="space-y-2">
          <span className="font-medium">Odpowiedź</span>
          <Textarea
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
          />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Anuluj
          </Button>
          <Button
            disabled={!valid || saving}
            onClick={() => {
              setSaving(true);
              void onSave(question.trim(), answer.trim()).catch(() => {
                setSaving(false);
                toast.error("Nie udało się zapisać fiszki.");
              });
            }}
          >
            {saving ? "Zapisywanie…" : "Zapisz"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
