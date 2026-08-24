import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
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
import type { Chapter, Topic } from "@/features/notes/model/types";
import type { QuestionsRepository } from "../data/questions-repository";
import type { Question, QuestionOption } from "../model/types";

type Props = {
  question?: Question | null;
  chapters: Chapter[];
  initialChapterId?: string;
  initialTopicId?: string;
  repository: QuestionsRepository;
  loadTopics: (chapterId: string) => Promise<Topic[] | null>;
  onClose: () => void;
  onSaved: () => void;
};

export function QuestionDialog({
  question,
  chapters,
  initialChapterId,
  initialTopicId,
  repository,
  loadTopics,
  onClose,
  onSaved,
}: Props) {
  const [content, setContent] = useState(question?.content ?? "");
  const [explanation, setExplanation] = useState(question?.explanation ?? "");
  const [chapterId, setChapterId] = useState(
    question?.chapterId ?? initialChapterId ?? "",
  );
  const [topicId, setTopicId] = useState(
    question?.topicId ?? initialTopicId ?? "",
  );
  const [topics, setTopics] = useState<Topic[]>(
    chapters.find((item) => item.id === chapterId)?.topics ?? [],
  );
  const [options, setOptions] = useState<QuestionOption[]>(
    question?.options ?? [{ content: "", isCorrect: true }],
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!chapterId) {
      return;
    }
    void loadTopics(chapterId).then((items) => setTopics(items ?? []));
  }, [chapterId, loadTopics]);
  const normalized = options.map((option) => option.content.trim());
  const valid = Boolean(
    content.trim() &&
    normalized.every(Boolean) &&
    new Set(normalized.map((item) => item.toLocaleLowerCase("pl"))).size ===
      options.length &&
    options.filter((option) => option.isCorrect).length === 1,
  );

  function updateOption(index: number, update: Partial<QuestionOption>) {
    setOptions((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...update } : item,
      ),
    );
  }
  function removeOption(index: number) {
    setOptions((items) => {
      const next = items.filter((_, itemIndex) => itemIndex !== index);
      if (next.length === 1) next[0] = { ...next[0], isCorrect: true };
      return next;
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {question ? "Edytuj pytanie" : "Dodaj pytanie"}
          </DialogTitle>
          <DialogDescription>
            Jedna odpowiedź wystarcza do fiszek. Co najmniej dwie pozwalają użyć
            pytania w teście.
          </DialogDescription>
        </DialogHeader>
        <label className="space-y-2">
          <span className="font-medium">Pytanie</span>
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
        </label>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">Odpowiedzi</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setOptions((items) => [
                  ...items,
                  { content: "", isCorrect: false },
                ])
              }
            >
              <Plus /> Dodaj odpowiedź
            </Button>
          </div>
          {options.map((option, index) => (
            <div key={index} className="flex items-start gap-2">
              <input
                className="mt-3"
                type="radio"
                name="correct"
                checked={option.isCorrect}
                aria-label={`Odpowiedź ${index + 1} jest poprawna`}
                onChange={() =>
                  setOptions((items) =>
                    items.map((item, itemIndex) => ({
                      ...item,
                      isCorrect: itemIndex === index,
                    })),
                  )
                }
              />
              <Textarea
                aria-label={`Odpowiedź ${index + 1}`}
                value={option.content}
                onChange={(event) =>
                  updateOption(index, { content: event.target.value })
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={options.length === 1}
                aria-label={`Usuń odpowiedź ${index + 1}`}
                onClick={() => removeOption(index)}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
        <label className="space-y-2">
          <span className="font-medium">
            Wyjaśnienie{" "}
            <span className="text-muted-foreground">(opcjonalne)</span>
          </span>
          <Textarea
            value={explanation}
            onChange={(event) => setExplanation(event.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="font-medium">Rozdział</span>
            <select
              className="h-9 w-full rounded-md border bg-background px-3"
              value={chapterId}
              onChange={(event) => {
                setChapterId(event.target.value);
                setTopicId("");
                setTopics([]);
              }}
            >
              <option value="">Nieprzypisane</option>
              {chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.title}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="font-medium">Temat</span>
            <select
              className="h-9 w-full rounded-md border bg-background px-3"
              value={topicId}
              disabled={!chapterId}
              onChange={(event) => setTopicId(event.target.value)}
            >
              <option value="">Bez konkretnego tematu</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Anuluj
          </Button>
          <Button
            disabled={!valid || saving}
            onClick={() => {
              setSaving(true);
              void repository
                .save({
                  id: question?.id,
                  chapterId: chapterId || null,
                  topicId: topicId || null,
                  content: content.trim(),
                  explanation: explanation.trim() || null,
                  options,
                })
                .then(() => {
                  onSaved();
                  onClose();
                  toast.success("Zapisano pytanie.");
                })
                .catch((error: unknown) => {
                  setSaving(false);
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Nie udało się zapisać pytania.",
                  );
                });
            }}
          >
            {saving ? "Zapisywanie…" : "Zapisz pytanie"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
