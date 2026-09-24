import type { Chapter, Topic } from "@/features/notes/types/model";
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
import type { Question } from "../model/types";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { QuestionsRepository } from "../data/questions-repository";
import { toast } from "@/components/ui/toast";
import { QuestionFormFields } from "./question-form-fields";
import {
  createQuestionFormValue,
  normalizeQuestionForm,
  validateQuestionForm,
} from "../model/question-form";

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
  const [form, setForm] = useState(() =>
    createQuestionFormValue(question ?? undefined),
  );
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
  const [saving, setSaving] = useState(false);
  const [duplicateStatus, setDuplicateStatus] = useState<
    "exact" | "same_content" | null
  >(null);
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
  const validationError = validateQuestionForm(form);

  async function saveQuestion(allowSameContent = false) {
    const normalized = normalizeQuestionForm(form);
    setSaving(true);
    try {
      const duplicate = await repository.getDuplicateStatus({
        id: question?.id,
        content: normalized.content,
        options: normalized.options,
      });
      if (duplicate?.kind === "exact") {
        setDuplicateStatus("exact");
        return;
      }
      if (duplicate?.kind === "same_content" && !allowSameContent) {
        setDuplicateStatus("same_content");
        return;
      }

      await repository.save({
        id: question?.id,
        chapterId: chapterId || null,
        topicId: topicId || null,
        content: normalized.content,
        explanation: normalized.explanation || null,
        options: normalized.options,
      });
      onSaved();
      onClose();
      toast.add({
        data: { type: "success" },
        description: "Zapisano pytanie.",
      });
    } catch (error: unknown) {
      toast.add({
        data: { type: "error" },
        description:
          error instanceof Error
            ? error.message
            : "Nie udało się zapisać pytania.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {question ? "Edytuj pytanie" : "Dodaj pytanie"}
          </DialogTitle>
          <DialogDescription>
            Dodaj odpowiedzi i wskaż prawidłową. Dwie lub więcej odpowiedzi
            udostępnią materiał również w testach.
          </DialogDescription>
        </DialogHeader>
        <QuestionFormFields
          value={form}
          onChange={(value) => {
            setForm(value);
            setDuplicateStatus(null);
          }}
          disabled={saving}
        />
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
        {duplicateStatus && (
          <div
            className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
            role="alert"
          >
            {duplicateStatus === "exact"
              ? "Identyczne pytanie już istnieje w tym module. Zmień jego treść lub odpowiedzi."
              : "Pytanie o tej samej treści już istnieje w tym module, ale ma inne odpowiedzi. Możesz zapisać je mimo to."}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Anuluj
          </Button>
          <Button
            disabled={
              Boolean(validationError) || saving || duplicateStatus === "exact"
            }
            onClick={() =>
              void saveQuestion(duplicateStatus === "same_content")
            }
          >
            {saving
              ? "Zapisywanie…"
              : duplicateStatus === "same_content"
                ? "Zapisz mimo to"
                : "Zapisz pytanie"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
