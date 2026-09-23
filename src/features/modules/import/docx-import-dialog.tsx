import { lazy, Suspense, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowLeft,
  BookOpen,
  FileText,
  FileUp,
  LoaderCircle,
} from "lucide-react";

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
  parseDocxFile,
  type ImportedModuleDraft,
} from "./docx-import";

const RichTextViewer = lazy(() =>
  import("@/features/notes/components/rich-text-editor").then((module) => ({
    default: module.RichTextViewer,
  })),
);

type Props = {
  existingModuleNames: string[];
  onClose: () => void;
  onImport: (draft: ImportedModuleDraft) => Promise<void>;
};

export function DocxImportDialog({
  existingModuleNames,
  onClose,
  onImport,
}: Props) {
  const [draft, setDraft] = useState<ImportedModuleDraft | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState({ chapter: 0, topic: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedTopic = draft?.chapters[preview.chapter]?.topics[preview.topic];
  const validationError = draft ? validateDraft(draft) : null;
  const topicsCount =
    draft?.chapters.reduce((sum, chapter) => sum + chapter.topics.length, 0) ??
    0;

  async function selectDocx(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setIsParsing(true);
    try {
      setDraft(await parseDocxFile(file, existingModuleNames));
      setPreview({ chapter: 0, topic: 0 });
    } catch (parseError) {
      setError(
        parseError instanceof Error
          ? parseError.message
          : "Nie udało się odczytać dokumentu Word.",
      );
    } finally {
      setIsParsing(false);
    }
  }

  async function submit() {
    if (!draft || validationError) {
      setError(validationError);
      return;
    }
    const normalized = normalizeImportedDraftTitles(draft);
    setDraft(normalized);
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
    <Dialog
      open
      onOpenChange={(open) => !open && !isImporting && !isParsing && onClose()}
    >
      <DialogContent className="flex max-h-[90dvh] w-[min(70rem,calc(100vw-2rem))] sm:max-w-fit flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Importuj materiały</DialogTitle>
          <DialogDescription>
            {draft
              ? "Sprawdź i popraw zawartość przed utworzeniem modułu."
              : "Wybierz sposób importu i dodaj dokument do przetworzenia."}
          </DialogDescription>
        </DialogHeader>

        <ImportSteps currentStep={draft ? 2 : 1} />

        {draft ? (
          <ImportPreview
            draft={draft}
            selectedTopic={selectedTopic}
            preview={preview}
            topicsCount={topicsCount}
            isImporting={isImporting}
            onDraftChange={setDraft}
            onPreviewChange={setPreview}
            onErrorClear={() => setError(null)}
          />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto py-8">
            <section className="w-full max-w-xl rounded-xl border bg-muted/20 p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <div className="rounded-lg border bg-background p-3 text-primary">
                  <FileText className="size-6" />
                </div>
                <div>
                  <h3 className="font-semibold">Microsoft Word</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Zaimportuj rozdziały, tematy i ich treść z dokumentu DOCX.
                  </p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                tabIndex={-1}
                onChange={(event) => void selectDocx(event)}
              />
              <Button
                type="button"
                className="mt-6 w-full sm:w-auto"
                disabled={isParsing}
                onClick={() => fileInputRef.current?.click()}
              >
                {isParsing ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <FileUp />
                )}
                {isParsing ? "Odczytywanie…" : "Wybierz plik DOCX"}
              </Button>
            </section>
          </div>
        )}

        <div className="min-h-5 text-sm text-destructive" role="alert">
          {error}
        </div>
        <DialogFooter>
          {draft ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={isImporting}
                onClick={() => {
                  setDraft(null);
                  setError(null);
                }}
              >
                <ArrowLeft /> Wróć do importu
              </Button>
              <Button
                type="button"
                disabled={Boolean(validationError) || isImporting}
                onClick={() => void submit()}
              >
                {isImporting && <LoaderCircle className="animate-spin" />}
                Importuj moduł
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={isParsing}
              onClick={onClose}
            >
              Anuluj
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportSteps({ currentStep }: { currentStep: 1 | 2 }) {
  return (
    <ol
      className="mx-auto flex w-full max-w-md items-start justify-center"
      aria-label="Postęp importu"
    >
      {[
        { number: 1, label: "Import" },
        { number: 2, label: "Podgląd" },
      ].map((step, index) => {
        const active = step.number <= currentStep;
        return (
          <li
            key={step.number}
            className="relative flex flex-col px-8 items-center gap-2 text-center text-xs font-medium last:flex-none"
            aria-current={step.number === currentStep ? "step" : undefined}
          >
            {index > 0 && (
              <span
                className={`absolute top-3 right-1/2 h-px w-full ${active ? "bg-primary" : "bg-border"}`}
                aria-hidden="true"
              />
            )}
            <span
              className={`relative z-10 flex size-6 items-center justify-center rounded-full border ${active ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
            >
              {step.number}
            </span>
            <span
              className={active ? "text-foreground" : "text-muted-foreground"}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

type ImportPreviewProps = {
  draft: ImportedModuleDraft;
  selectedTopic:
    ImportedModuleDraft["chapters"][number]["topics"][number] | undefined;
  preview: { chapter: number; topic: number };
  topicsCount: number;
  isImporting: boolean;
  onDraftChange: (draft: ImportedModuleDraft) => void;
  onPreviewChange: (preview: { chapter: number; topic: number }) => void;
  onErrorClear: () => void;
};

function ImportPreview({
  draft,
  selectedTopic,
  preview,
  topicsCount,
  isImporting,
  onDraftChange,
  onPreviewChange,
  onErrorClear,
}: ImportPreviewProps) {
  function updateChapter(chapterIndex: number, title: string) {
    onDraftChange({
      ...draft,
      chapters: draft.chapters.map((chapter, index) =>
        index === chapterIndex ? { ...chapter, title } : chapter,
      ),
    });
    onErrorClear();
  }

  function updateTopic(
    chapterIndex: number,
    topicIndex: number,
    title: string,
  ) {
    onDraftChange({
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
    onErrorClear();
  }

  return (
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
              onDraftChange({ ...draft, name: event.target.value });
              onErrorClear();
            }}
          />
        </label>

        <p className="text-xs text-muted-foreground">
          Wykryto {draft.chapters.length} rozdziałów i {topicsCount} tematów.
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
                        onPreviewChange({
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
          {selectedTopic ? `Treść: ${selectedTopic.title}` : "Podgląd treści"}
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
