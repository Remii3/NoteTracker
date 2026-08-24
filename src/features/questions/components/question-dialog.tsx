import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
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

type SelectOption = {
  value: string;
  label: string;
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
  const [topicsLoading, setTopicsLoading] = useState(Boolean(chapterId));
  const [topicsError, setTopicsError] = useState(false);
  const [options, setOptions] = useState<QuestionOption[]>(
    question?.options ?? [{ content: "", isCorrect: true }],
  );
  const [saving, setSaving] = useState(false);
  const chapterOptions: SelectOption[] = chapters.map((chapter) => ({
    value: chapter.id,
    label: chapter.title,
  }));
  const topicOptions: SelectOption[] = topics.map((topic) => ({
    value: topic.id,
    label: topic.title,
  }));
  const selectedChapterOption =
    chapterOptions.find((option) => option.value === chapterId) ?? null;
  const selectedTopicOption =
    topicOptions.find((option) => option.value === topicId) ?? null;

  useEffect(() => {
    if (!chapterId) {
      queueMicrotask(() => {
        setTopics([]);
        setTopicsLoading(false);
        setTopicsError(false);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setTopicsLoading(true);
      setTopicsError(false);
    });
    void loadTopics(chapterId).then((items) => {
      if (cancelled) return;
      setTopics(items ?? []);
      setTopicsLoading(false);
      setTopicsError(items === null);
      setTopicId((current) =>
        current && !items?.some((topic) => topic.id === current) ? "" : current,
      );
    });
    return () => {
      cancelled = true;
    };
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
          <div className="space-y-2">
            <span className="font-medium">Rozdział</span>
            <Combobox
              items={chapterOptions}
              value={selectedChapterOption}
              onValueChange={(option) => {
                setChapterId(option?.value ?? "");
                setTopicId("");
                setTopics([]);
                setTopicsError(false);
              }}
              itemToStringLabel={(option) => option.label}
              itemToStringValue={(option) => option.value}
              isItemEqualToValue={(option, value) =>
                option.value === value.value
              }
            >
              <ComboboxInput
                className="w-full"
                placeholder="Wyszukaj rozdział…"
                showClear={Boolean(selectedChapterOption)}
              />
              <ComboboxContent>
                <ComboboxEmpty>Nie znaleziono rozdziału.</ComboboxEmpty>
                <ComboboxList>
                  <ComboboxCollection>
                    {(option: SelectOption) => (
                      <ComboboxItem key={option.value} value={option}>
                        {option.label}
                      </ComboboxItem>
                    )}
                  </ComboboxCollection>
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            {!chapterId && (
              <span className="block text-xs text-muted-foreground">
                Pozostaw puste, aby nie przypisywać pytania.
              </span>
            )}
          </div>
          <div className="space-y-2">
            <span className="font-medium">Temat</span>
            <Combobox
              items={topicOptions}
              value={selectedTopicOption}
              onValueChange={(option) => setTopicId(option?.value ?? "")}
              itemToStringLabel={(option) => option.label}
              itemToStringValue={(option) => option.value}
              isItemEqualToValue={(option, value) =>
                option.value === value.value
              }
            >
              <ComboboxInput
                className="w-full"
                disabled={!chapterId || topicsLoading || topicsError}
                showClear={Boolean(selectedTopicOption)}
                placeholder={
                  !chapterId
                    ? "Najpierw wybierz rozdział"
                    : topicsLoading
                      ? "Ładowanie tematów…"
                      : topicsError
                        ? "Nie udało się pobrać tematów"
                        : "Wyszukaj temat…"
                }
              />
              <ComboboxContent>
                <ComboboxEmpty>Nie znaleziono tematu.</ComboboxEmpty>
                <ComboboxList>
                  <ComboboxCollection>
                    {(option: SelectOption) => (
                      <ComboboxItem key={option.value} value={option}>
                        {option.label}
                      </ComboboxItem>
                    )}
                  </ComboboxCollection>
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            {!topicsLoading && !topicsError && chapterId && !topics.length && (
              <span className="block text-xs text-muted-foreground">
                Ten rozdział nie ma jeszcze tematów.
              </span>
            )}
          </div>
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
