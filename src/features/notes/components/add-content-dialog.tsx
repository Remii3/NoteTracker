import { useRef, useState, type FormEvent } from "react";
import { CircleAlert, CircleCheck, CirclePlus, Plus } from "lucide-react";

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
import { normalizeTitle } from "../lib/title-utils";
import type { Chapter } from "../types/model";

type ChapterOption = {
  value: string;
  label: string;
  kind: "existing" | "create";
  title: string;
};

type Props = {
  open: boolean;
  chapters: Chapter[];
  onOpenChange: (open: boolean) => void;
  onAddChapter: (title: string, topicTitles: string[]) => Promise<boolean>;
  onAddTopics: (chapterId: string, titles: string[]) => Promise<boolean>;
};

export function AddContentDialog({
  open,
  chapters,
  onOpenChange,
  onAddChapter,
  onAddTopics,
}: Props) {
  const [topicTitles, setTopicTitles] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const chapterInputRef = useRef<HTMLInputElement>(null);
  const chapterOptions: ChapterOption[] = chapters.map((chapter) => ({
    value: chapter.id,
    label: chapter.title,
    kind: "existing",
    title: chapter.title,
  }));
  const [selectedChapterOption, setSelectedChapterOption] =
    useState<ChapterOption | null>(null);
  const [chapterQuery, setChapterQuery] = useState("");
  const trimmedChapterQuery = chapterQuery.trim();
  const exactChapterExists = chapterOptions.some(
    (option) => normalizeTitle(option.title) === normalizeTitle(chapterQuery),
  );
  const createOption: ChapterOption | null =
    trimmedChapterQuery && !exactChapterExists
      ? {
          value: `create:${normalizeTitle(trimmedChapterQuery)}`,
          label: `Utwórz „${trimmedChapterQuery}”`,
          kind: "create",
          title: trimmedChapterQuery,
        }
      : null;
  const availableChapterOptions = createOption
    ? [...chapterOptions, createOption]
    : chapterOptions;
  const hasTopicTitles = topicTitles
    .split("\n")
    .some((title) => title.trim().length > 0);
  const canSubmit =
    Boolean(trimmedChapterQuery) &&
    (!selectedChapterOption ||
      selectedChapterOption?.kind === "create" ||
      (selectedChapterOption?.kind === "existing" && hasTopicTitles));

  function focusChapterInput() {
    setComboboxOpen(true);
    window.requestAnimationFrame(() => chapterInputRef.current?.focus());
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

    const titles = topicTitles
      .split("\n")
      .map((title) => title.trim())
      .filter(Boolean);
    let chapterOption = selectedChapterOption;
    if (!chapterOption) {
      chapterOption =
        chapterOptions.find(
          (option) =>
            normalizeTitle(option.title) === normalizeTitle(chapterQuery),
        ) ?? null;
      if (!chapterOption) {
        setError(
          `Wybierz istniejący rozdział z listy albo kliknij Utwórz „${trimmedChapterQuery}”.`,
        );
        focusChapterInput();
        return;
      }
      setSelectedChapterOption(chapterOption);
      setChapterQuery(chapterOption.title);
    }

    if (chapterOption.kind === "create") {
      const title = chapterOption.title;
      const existingNames = new Set(
        chapters.map((chapter) => normalizeTitle(chapter.title)),
      );
      if (existingNames.has(normalizeTitle(title))) {
        setError(`Rozdział „${title}” już istnieje.`);
        return;
      }
      const submittedNames = new Set<string>();
      const duplicate = titles.find((topicTitle) => {
        const normalized = normalizeTitle(topicTitle);
        if (submittedNames.has(normalized)) return true;
        submittedNames.add(normalized);
        return false;
      });
      if (duplicate) {
        setError(`Temat „${duplicate}” został podany więcej niż raz.`);
        return;
      }
      setIsSubmitting(true);
      const added = await onAddChapter(title, titles);
      setIsSubmitting(false);
      if (!added) return;
      setTopicTitles("");
    } else {
      if (!titles.length) {
        setError("Dodaj co najmniej jeden temat do istniejącego rozdziału.");
        return;
      }
      const targetChapter = chapters.find(
        (chapter) => chapter.id === chapterOption.value,
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
      const added = await onAddTopics(chapterOption.value, titles);
      setIsSubmitting(false);
      if (!added) return;
      setTopicTitles("");
    }

    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Dodaj zawartość</DialogTitle>
          <DialogDescription>
            Wybierz istniejący rozdział albo jawnie utwórz nowy, a następnie
            dodaj jego tematy.
          </DialogDescription>
        </DialogHeader>

        <form className="flex min-h-0 flex-col gap-5" onSubmit={handleSubmit}>
          <div className="-mx-2 -my-1 min-h-0 flex-1 space-y-5 overflow-y-auto px-2 py-1">
            <div className="space-y-2">
              <label htmlFor="target-chapter" className="text-sm font-medium">
                Rozdział
              </label>
              <Combobox
                items={availableChapterOptions}
                value={selectedChapterOption}
                inputValue={chapterQuery}
                open={comboboxOpen}
                onOpenChange={setComboboxOpen}
                onInputValueChange={(value, details) => {
                  if (details.reason === "input-clear") {
                    details.cancel();
                    return;
                  }
                  const isUserInput =
                    details.reason === "input-change" ||
                    details.reason === "clear-press";
                  if (!isUserInput) return;
                  setChapterQuery(value);
                  setSelectedChapterOption(null);
                  setError(null);
                }}
                onValueChange={(option) => {
                  setSelectedChapterOption(option);
                  setChapterQuery(option?.title ?? "");
                  setError(null);
                }}
                itemToStringLabel={(option) => option.title}
                itemToStringValue={(option) => option.value}
                isItemEqualToValue={(option, value) =>
                  option.value === value.value
                }
              >
                <ComboboxInput
                  ref={chapterInputRef}
                  id="target-chapter"
                  autoFocus
                  placeholder="Wyszukaj lub wpisz nazwę rozdziału…"
                  className="w-full"
                />
                <ComboboxContent>
                  <ComboboxEmpty>Wpisz nazwę nowego rozdziału.</ComboboxEmpty>
                  <ComboboxList>
                    <ComboboxCollection>
                      {(option: ChapterOption) => (
                        <ComboboxItem key={option.value} value={option}>
                          {option.kind === "create" && <Plus />}
                          {option.label}
                        </ComboboxItem>
                      )}
                    </ComboboxCollection>
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              <div
                role="status"
                aria-live="polite"
                className="flex min-h-5 items-start gap-1.5 text-xs"
              >
                {selectedChapterOption?.kind === "existing" ? (
                  <>
                    <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-primary dark:text-chart-2" />
                    <span className="text-muted-foreground">
                      Wybrano istniejący rozdział:{" "}
                      <strong className="font-medium text-foreground">
                        {selectedChapterOption.title}
                      </strong>
                    </span>
                  </>
                ) : selectedChapterOption?.kind === "create" ? (
                  <>
                    <CirclePlus className="mt-0.5 size-3.5 shrink-0 text-primary dark:text-chart-2" />
                    <span className="text-muted-foreground">
                      Zostanie utworzony nowy rozdział:{" "}
                      <strong className="font-medium text-foreground">
                        {selectedChapterOption.title}
                      </strong>
                    </span>
                  </>
                ) : trimmedChapterQuery ? (
                  <>
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="text-amber-700 dark:text-amber-300">
                      Nie wybrano rozdziału. Wybierz wynik albo opcję „Utwórz”.
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    Wyszukaj rozdział lub wpisz nazwę nowego.
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="topic-titles" className="text-sm font-medium">
                Tematy{" "}
                {selectedChapterOption?.kind === "create" && (
                  <span className="font-normal text-muted-foreground">
                    (opcjonalnie)
                  </span>
                )}
              </label>
              <Textarea
                id="topic-titles"
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

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="shrink-0">
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
                : selectedChapterOption?.kind === "create"
                  ? "Utwórz rozdział"
                  : selectedChapterOption?.kind === "existing"
                    ? "Dodaj tematy"
                    : "Dodaj zawartość"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
