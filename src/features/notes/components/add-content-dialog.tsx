import { useState, type FormEvent } from "react";

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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { normalizeTitle, titlesAreEqual } from "../lib/title-utils";
import type { Chapter } from "../model/types";

type AddMode = "chapter" | "topics";
type ChapterOption = {
  value: string;
  label: string;
};

type Props = {
  open: boolean;
  chapters: Chapter[];
  activeChapterId: string;
  onOpenChange: (open: boolean) => void;
  onAddChapter: (title: string) => Promise<boolean>;
  onAddTopics: (chapterId: string, titles: string[]) => Promise<boolean>;
};

export function AddContentDialog({
  open,
  chapters,
  activeChapterId,
  onOpenChange,
  onAddChapter,
  onAddTopics,
}: Props) {
  const [mode, setMode] = useState<AddMode>("topics");
  const [chapterTitle, setChapterTitle] = useState("");
  const [topicTitles, setTopicTitles] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [targetChapterId, setTargetChapterId] = useState(
    activeChapterId || chapters[0]?.id || "",
  );
  const chapterOptions: ChapterOption[] = chapters.map((chapter) => ({
    value: chapter.id,
    label: chapter.title,
  }));
  const selectedChapterOption =
    chapterOptions.find((option) => option.value === targetChapterId) ?? null;
  const hasChapterTitle = chapterTitle.trim().length > 0;
  const hasTopicTitles = topicTitles
    .split("\n")
    .some((title) => title.trim().length > 0);
  const canSubmit =
    mode === "chapter"
      ? hasChapterTitle
      : selectedChapterOption !== null && hasTopicTitles;

  function changeMode(nextMode: AddMode) {
    setMode(nextMode);
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (mode === "chapter") {
      const title = chapterTitle.trim();
      if (!title) return;
      if (chapters.some((chapter) => titlesAreEqual(chapter.title, title))) {
        setError("Rozdział o tej nazwie już istnieje.");
        return;
      }
      setIsSubmitting(true);
      const added = await onAddChapter(title);
      setIsSubmitting(false);
      if (!added) return;
      setChapterTitle("");
    } else {
      const titles = topicTitles
        .split("\n")
        .map((title) => title.trim())
        .filter(Boolean);
      if (!selectedChapterOption || !titles.length) return;
      const targetChapter = chapters.find(
        (chapter) => chapter.id === targetChapterId,
      );
      const existingNames = new Set(
        targetChapter?.topics.map((topic) => normalizeTitle(topic.title)),
      );
      const submittedNames = new Set<string>();
      const duplicate = titles.find((title) => {
        const normalized = normalizeTitle(title);
        if (existingNames.has(normalized) || submittedNames.has(normalized))
          return true;
        submittedNames.add(normalized);
        return false;
      });
      if (duplicate) {
        setError(`Temat „${duplicate}” już istnieje w tym rozdziale.`);
        return;
      }
      setIsSubmitting(true);
      const added = await onAddTopics(targetChapterId, titles);
      setIsSubmitting(false);
      if (!added) return;
      setTopicTitles("");
    }

    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dodaj zawartość</DialogTitle>
          <DialogDescription>
            Utwórz nowy rozdział albo dodaj jeden lub kilka tematów do wybranego
            rozdziału.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
          <Button
            type="button"
            variant={mode === "topics" ? "default" : "ghost"}
            onClick={() => changeMode("topics")}
          >
            Tematy
          </Button>
          <Button
            type="button"
            variant={mode === "chapter" ? "default" : "ghost"}
            onClick={() => changeMode("chapter")}
          >
            Rozdział
          </Button>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          {mode === "chapter" ? (
            <div className="space-y-2">
              <label htmlFor="chapter-title" className="text-sm font-medium">
                Nazwa rozdziału
              </label>
              <Input
                id="chapter-title"
                autoFocus
                value={chapterTitle}
                onChange={(event) => {
                  setChapterTitle(event.target.value);
                  setError(null);
                }}
                placeholder="np. JavaScript"
              />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Rozdział docelowy</label>
                <Combobox
                  items={chapterOptions}
                  value={selectedChapterOption}
                  onValueChange={(option) => {
                    setTargetChapterId(option?.value ?? "");
                    setError(null);
                  }}
                  itemToStringLabel={(option) => option.label}
                  itemToStringValue={(option) => option.value}
                  isItemEqualToValue={(option, value) =>
                    option.value === value.value
                  }
                >
                  <ComboboxInput
                    placeholder="Wyszukaj rozdział…"
                    disabled={!chapterOptions.length}
                    className="w-full"
                  />
                  <ComboboxContent>
                    <ComboboxEmpty>Nie znaleziono rozdziału.</ComboboxEmpty>
                    <ComboboxList>
                      <ComboboxCollection>
                        {(option: ChapterOption) => (
                          <ComboboxItem key={option.value} value={option}>
                            {option.label}
                          </ComboboxItem>
                        )}
                      </ComboboxCollection>
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </div>
              <div className="space-y-2">
                <label htmlFor="topic-titles" className="text-sm font-medium">
                  Nazwy tematów
                </label>
                <Textarea
                  id="topic-titles"
                  autoFocus
                  value={topicTitles}
                  onChange={(event) => {
                    setTopicTitles(event.target.value);
                    setError(null);
                  }}
                  placeholder={"Podstawy\nFunkcje\nAsync i await"}
                  className="min-h-36"
                  aria-describedby="topic-titles-hint"
                />
                <p
                  id="topic-titles-hint"
                  className="text-xs text-muted-foreground"
                >
                  Każdy wiersz utworzy osobny temat.
                </p>
              </div>
            </>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => handleOpenChange(false)}
            >
              Anuluj
            </Button>
            <Button type="submit" disabled={!canSubmit || isSubmitting}>
              {isSubmitting
                ? "Dodawanie…"
                : mode === "chapter"
                  ? "Dodaj rozdział"
                  : "Dodaj tematy"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
