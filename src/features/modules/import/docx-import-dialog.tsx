import { lazy, Suspense, useState } from "react";
import { BookOpen, FileText, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MODULE_NAME_MAX_LENGTH } from "../lib/module-validation";
import {
  normalizeImportedDraftTitles,
  type ImportedModuleDraft,
} from "./docx-import";

const RichTextViewer = lazy(() =>
  import("@/features/notes/components/rich-text-editor").then((module) => ({
    default: module.RichTextViewer,
  })),
);

type Props = {
  draft: ImportedModuleDraft;
  onChange: (draft: ImportedModuleDraft) => void;
  onClose: () => void;
  onImport: (draft: ImportedModuleDraft) => Promise<void>;
};

export function DocxImportDialog({
  draft,
  onChange,
  onClose,
  onImport,
}: Props) {
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState({ chapter: 0, topic: 0 });
  const selectedTopic = draft.chapters[preview.chapter]?.topics[preview.topic];
  const validationError = validateDraft(draft);
  const topicsCount = draft.chapters.reduce(
    (sum, chapter) => sum + chapter.topics.length,
    0,
  );

  function updateChapter(chapterIndex: number, title: string) {
    onChange({
      ...draft,
      chapters: draft.chapters.map((chapter, index) =>
        index === chapterIndex ? { ...chapter, title } : chapter,
      ),
    });
    setError(null);
  }

  function updateTopic(
    chapterIndex: number,
    topicIndex: number,
    title: string,
  ) {
    onChange({
      ...draft,
      chapters: draft.chapters.map((chapter, index) =>
        index === chapterIndex
          ? {
              ...chapter,
              topics: chapter.topics.map((topic, childIndex) =>
                childIndex === topicIndex ? { ...topic, title } : topic,
              ),
            }
          : chapter,
      ),
    });
    setError(null);
  }

  async function submit() {
    if (validationError) {
      setError(validationError);
      return;
    }
    const normalized = normalizeImportedDraftTitles(draft);
    onChange(normalized);
    setIsImporting(true);
    setError(null);
    try {
      await onImport(normalized);
    } catch {
      setError("Nie udało się zaimportować dokumentu. Spróbuj ponownie.");
      setIsImporting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !isImporting && onClose()}>
      <DialogContent className="flex max-h-[90dvh] w-[min(70rem,calc(100vw-2rem))] max-w-none flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Podgląd importu Word</DialogTitle>
          <DialogDescription>
            Sprawdź i popraw nazwy przed utworzeniem modułu.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto pr-1 lg:grid-cols-[minmax(20rem,0.9fr)_minmax(22rem,1.1fr)]">
          <div className="space-y-4">
            <label className="block space-y-2 text-sm font-medium">
              <span>Nazwa modułu</span>
              <Input
                value={draft.name}
                maxLength={MODULE_NAME_MAX_LENGTH}
                disabled={isImporting}
                aria-invalid={!draft.name.trim()}
                onChange={(event) => {
                  onChange({ ...draft, name: event.target.value });
                  setError(null);
                }}
              />
            </label>

            <p className="text-xs text-muted-foreground">
              Wykryto {draft.chapters.length} rozdziałów i {topicsCount}{" "}
              tematów.
            </p>

            {draft.warnings.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <p className="font-medium">Uwagi do dokumentu:</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                  {draft.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-4">
              {draft.chapters.map((chapter, chapterIndex) => (
                <section
                  key={chapterIndex}
                  className="rounded-lg border bg-muted/20 p-3"
                >
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <BookOpen className="size-4 shrink-0 text-primary" />
                    <span className="sr-only">Nazwa rozdziału</span>
                    <Input
                      value={chapter.title}
                      disabled={isImporting}
                      aria-invalid={!chapter.title.trim()}
                      onChange={(event) =>
                        updateChapter(chapterIndex, event.target.value)
                      }
                    />
                  </label>
                  <div className="mt-2 space-y-2 pl-6">
                    {chapter.topics.map((topic, topicIndex) => (
                      <div key={topicIndex} className="flex gap-2">
                        <Input
                          value={topic.title}
                          disabled={isImporting}
                          aria-label="Nazwa tematu"
                          aria-invalid={!topic.title.trim()}
                          onChange={(event) =>
                            updateTopic(
                              chapterIndex,
                              topicIndex,
                              event.target.value,
                            )
                          }
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant={
                            preview.chapter === chapterIndex &&
                            preview.topic === topicIndex
                              ? "secondary"
                              : "ghost"
                          }
                          aria-label={`Pokaż treść tematu ${topic.title}`}
                          onClick={() =>
                            setPreview({
                              chapter: chapterIndex,
                              topic: topicIndex,
                            })
                          }
                        >
                          <FileText />
                        </Button>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>

          <section className="min-h-72 rounded-lg border p-4">
            <h3 className="text-sm font-medium">
              {selectedTopic
                ? `Treść: ${selectedTopic.title}`
                : "Podgląd treści"}
            </h3>
            {selectedTopic ? (
              <div className="mt-3">
                <Suspense fallback={<PreviewSkeleton />}>
                  <RichTextViewer content={selectedTopic.content} />
                </Suspense>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Ten dokument nie zawiera tematu do wyświetlenia.
              </p>
            )}
          </section>
        </div>

        <div className="min-h-5 text-sm text-destructive" role="alert">
          {error}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isImporting}
            onClick={onClose}
          >
            Anuluj
          </Button>
          <Button
            type="button"
            disabled={Boolean(validationError) || isImporting}
            onClick={() => void submit()}
          >
            {isImporting && <LoaderCircle className="animate-spin" />}
            Importuj moduł
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function validateDraft(draft: ImportedModuleDraft) {
  if (!draft.name.trim()) return "Podaj nazwę modułu.";
  if (draft.name.trim().length > MODULE_NAME_MAX_LENGTH) {
    return `Nazwa modułu może mieć maksymalnie ${MODULE_NAME_MAX_LENGTH} znaków.`;
  }
  if (draft.chapters.some((chapter) => !chapter.title.trim())) {
    return "Każdy rozdział musi mieć nazwę.";
  }
  if (
    draft.chapters.some((chapter) =>
      chapter.topics.some((topic) => !topic.title.trim()),
    )
  ) {
    return "Każdy temat musi mieć nazwę.";
  }
  return null;
}

function PreviewSkeleton() {
  return (
    <div className="space-y-3" aria-label="Ładowanie podglądu treści">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}
