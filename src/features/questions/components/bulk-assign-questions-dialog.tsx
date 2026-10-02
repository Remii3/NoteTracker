import { useEffect, useState } from "react";

import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import type { Chapter, Topic } from "@/features/notes/types/model";
import type { QuestionsRepository } from "../data/questions-repository";

type SelectOption = { value: string; label: string };

type Props = {
  questionIds: string[];
  chapters: Chapter[];
  repository: QuestionsRepository;
  loadTopics: (chapterId: string) => Promise<Topic[] | null>;
  onClose: () => void;
  onAssigned: () => void | Promise<void>;
};

export function BulkAssignQuestionsDialog({
  questionIds,
  chapters,
  repository,
  loadTopics,
  onClose,
  onAssigned,
}: Props) {
  const [chapterId, setChapterId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topicsError, setTopicsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const chapterOptions: SelectOption[] = chapters.map((chapter) => ({
    value: chapter.id,
    label: chapter.title,
  }));
  const topicOptions: SelectOption[] = topics.map((topic) => ({
    value: topic.id,
    label: topic.title,
  }));
  const selectedChapter =
    chapterOptions.find((option) => option.value === chapterId) ?? null;
  const selectedTopic =
    topicOptions.find((option) => option.value === topicId) ?? null;

  useEffect(() => {
    if (!chapterId) return;
    let cancelled = false;
    void loadTopics(chapterId).then((items) => {
      if (cancelled) return;
      setTopics(items ?? []);
      setTopicsLoading(false);
      setTopicsError(items === null);
    });
    return () => {
      cancelled = true;
    };
  }, [chapterId, loadTopics]);

  async function assign() {
    if (!chapterId) return;
    setSaving(true);
    try {
      const assigned = await repository.bulkAssign({
        questionIds,
        chapterId,
        topicId: topicId || null,
      });
      await onAssigned();
      onClose();
      toast.add({
        data: { type: "success" },
        description: `Przypisano pytania: ${assigned}.`,
      });
    } catch (error: unknown) {
      toast.add({
        data: { type: "error" },
        description:
          error instanceof Error
            ? error.message
            : "Nie udało się przypisać pytań.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Przypisz zaznaczone pytania</DialogTitle>
          <DialogDescription>
            Wybierz rozdział oraz opcjonalnie temat dla {questionIds.length}{" "}
            {questionIds.length === 1 ? "pytania" : "pytań"}. Wybranie samego
            rozdziału usunie wcześniejsze przypisanie do tematu.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="font-medium">Rozdział</span>
            <Combobox
              items={chapterOptions}
              value={selectedChapter}
              onValueChange={(option) => {
                const nextChapterId = option?.value ?? "";
                setChapterId(nextChapterId);
                setTopicId("");
                setTopics([]);
                setTopicsLoading(Boolean(nextChapterId));
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
                placeholder="Wybierz rozdział…"
                showClear={Boolean(selectedChapter)}
                aria-label="Rozdział docelowy"
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
          </label>
          <label className="space-y-2">
            <span className="font-medium">Temat (opcjonalnie)</span>
            <Combobox
              items={topicOptions}
              value={selectedTopic}
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
                showClear={Boolean(selectedTopic)}
                aria-label="Temat docelowy"
                placeholder={
                  !chapterId
                    ? "Najpierw wybierz rozdział"
                    : topicsLoading
                      ? "Ładowanie tematów…"
                      : topicsError
                        ? "Nie udało się pobrać tematów"
                        : "Wybierz temat…"
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
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Anuluj
          </Button>
          <Button disabled={!chapterId || saving} onClick={() => void assign()}>
            {saving ? "Przypisywanie…" : "Przypisz pytania"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
