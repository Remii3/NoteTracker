import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  FileCheck2,
  FileText,
  FileUp,
  LoaderCircle,
  Pencil,
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
import {
  useRichTextModule,
  type RichTextModule,
} from "@/features/notes/hooks/use-rich-text-module";
import { cn } from "@/lib/utils";
import { MODULE_NAME_MAX_LENGTH } from "../lib/module-validation";
import {
  normalizeImportedDraftTitles,
  parseDocxFile,
  type ImportedModuleDraft,
} from "./docx-import";

type Props = {
  existingModuleNames: string[];
  onClose: () => void;
  onImport: (draft: ImportedModuleDraft) => Promise<void>;
};

type ImportStep = "source" | "preview";
type PreviewSelection = { chapter: number; topic: number };

export function ModuleImportDialog({
  existingModuleNames,
  onClose,
  onImport,
}: Props) {
  const [step, setStep] = useState<ImportStep>("source");
  const [draft, setDraft] = useState<ImportedModuleDraft | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewSelection>({
    chapter: 0,
    topic: 0,
  });
  const { richTextModule } = useRichTextModule(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedTopic = draft?.chapters[preview.chapter]?.topics[preview.topic];
  const validationError = draft ? validateDraft(draft) : null;
  const topicsCount =
    draft?.chapters.reduce((sum, chapter) => sum + chapter.topics.length, 0) ??
    0;

  async function readDocx(file: File) {
    setError(null);
    setIsParsing(true);
    try {
      const parsed = await parseDocxFile(file, existingModuleNames);
      const firstChapterWithTopic = Math.max(
        0,
        parsed.chapters.findIndex((chapter) => chapter.topics.length > 0),
      );
      setDraft(parsed);
      setFileName(file.name);
      setPreview({ chapter: firstChapterWithTopic, topic: 0 });
      setStep("preview");
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

  function selectDocx(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void readDocx(file);
  }

  function dropDocx(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void readDocx(file);
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
      <DialogContent className="flex h-[min(52rem,calc(100dvh-2rem))] w-[min(70rem,calc(100vw-2rem))] max-w-none flex-col overflow-hidden sm:max-w-fit">
        <DialogHeader>
          <DialogTitle>Importuj moduł</DialogTitle>
          <DialogDescription>
            {step === "preview"
              ? "Sprawdź strukturę i treść przed utworzeniem modułu."
              : "Dodaj dokument Word, a następnie sprawdź wynik importu."}
          </DialogDescription>
        </DialogHeader>

        <ImportSteps currentStep={step === "source" ? 1 : 2} />

        {step === "preview" && draft ? (
          <ImportPreview
            draft={draft}
            selectedTopic={selectedTopic}
            preview={preview}
            topicsCount={topicsCount}
            isImporting={isImporting}
            richTextModule={richTextModule}
            onDraftChange={setDraft}
            onPreviewChange={setPreview}
            onErrorClear={() => setError(null)}
          />
        ) : (
          <ImportSourceStep
            draftReady={Boolean(draft)}
            fileName={fileName}
            isDragging={isDragging}
            isParsing={isParsing}
            fileInputRef={fileInputRef}
            onDragStateChange={setIsDragging}
            onDrop={dropDocx}
            onFileChange={selectDocx}
          />
        )}

        <div className="min-h-5 text-sm text-destructive" role="alert">
          {error ?? (step === "preview" ? validationError : null)}
        </div>
        <DialogFooter className="shrink-0">
          {step === "preview" ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={isImporting}
                onClick={() => {
                  setStep("source");
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
            <>
              <Button
                type="button"
                variant="outline"
                disabled={isParsing}
                onClick={onClose}
              >
                Anuluj
              </Button>
              {draft && (
                <Button
                  type="button"
                  disabled={isParsing}
                  onClick={() => {
                    setStep("preview");
                    setError(null);
                  }}
                >
                  Przejdź do podglądu
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportSteps({ currentStep }: { currentStep: 1 | 2 }) {
  const steps = [
    { number: 1, label: "Import" },
    { number: 2, label: "Podgląd" },
  ] as const;

  return (
    <ol
      className="relative mx-auto grid w-full max-w-md shrink-0 grid-cols-2"
      aria-label="Postęp importu"
    >
      <span
        className="absolute top-3 right-1/4 left-1/4 h-px bg-border"
        aria-hidden="true"
      />
      <span
        className={cn(
          "absolute top-3 left-1/4 h-px bg-primary transition-[width]",
          currentStep === 2 ? "w-1/2" : "w-0",
        )}
        aria-hidden="true"
      />
      {steps.map((item) => {
        const completed = item.number < currentStep;
        const current = item.number === currentStep;
        return (
          <li
            key={item.number}
            className="relative z-10 flex flex-col items-center gap-2 text-center text-xs font-medium"
            aria-current={current ? "step" : undefined}
          >
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border bg-background transition-colors",
                (completed || current) &&
                  "border-primary bg-primary text-primary-foreground",
                !completed && !current && "text-muted-foreground",
              )}
            >
              {completed ? <Check className="size-3.5" /> : item.number}
            </span>
            <span
              className={current ? "text-foreground" : "text-muted-foreground"}
            >
              {item.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

type ImportSourceStepProps = {
  draftReady: boolean;
  fileName: string | null;
  isDragging: boolean;
  isParsing: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onDragStateChange: (dragging: boolean) => void;
  onDrop: (event: DragEvent<HTMLButtonElement>) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

function ImportSourceStep({
  draftReady,
  fileName,
  isDragging,
  isParsing,
  fileInputRef,
  onDragStateChange,
  onDrop,
  onFileChange,
}: ImportSourceStepProps) {
  return (
    <div className="grid min-h-0 flex-1 items-stretch gap-5 overflow-y-auto py-2 md:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="flex min-h-80 flex-col rounded-xl border bg-muted/10 p-5 sm:p-7">
        <div>
          <h3 className="font-semibold">Wybierz dokument</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Możesz przeciągnąć plik do pola albo wybrać go z urządzenia.
          </p>
        </div>
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          tabIndex={-1}
          onChange={onFileChange}
        />
        <button
          type="button"
          className={cn(
            "mt-5 flex min-h-52 flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            isDragging && "border-primary bg-primary/5",
            draftReady &&
              !isDragging &&
              "border-emerald-500/50 bg-emerald-500/5",
            !draftReady &&
              !isDragging &&
              "border-border hover:border-primary/60 hover:bg-muted/30",
          )}
          disabled={isParsing}
          aria-describedby="docx-format-help"
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            onDragStateChange(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node))
              onDragStateChange(false);
          }}
          onDrop={onDrop}
        >
          {isParsing ? (
            <LoaderCircle className="size-9 animate-spin text-primary" />
          ) : draftReady ? (
            <FileCheck2 className="size-9 text-emerald-600" />
          ) : (
            <FileUp className="size-9 text-primary" />
          )}
          <span className="mt-4 font-medium">
            {isParsing
              ? "Odczytywanie dokumentu…"
              : draftReady
                ? fileName
                : "Przeciągnij tutaj plik DOCX"}
          </span>
          <span className="mt-1 text-sm text-muted-foreground">
            {draftReady
              ? "Dokument jest gotowy. Kliknij, aby wybrać inny plik."
              : "lub kliknij, aby wybrać plik"}
          </span>
        </button>
        <p id="docx-format-help" className="mt-3 text-xs text-muted-foreground">
          Obsługiwany format: Microsoft Word (.docx)
        </p>
      </section>

      <aside className="rounded-xl border bg-muted/20 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border bg-background p-2.5 text-primary">
            <FileText className="size-5" />
          </div>
          <div>
            <h3 className="font-semibold">Microsoft Word</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Import modułu z DOCX
            </p>
          </div>
        </div>
        <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
            Rozdziały i tematy zostaną odczytane ze struktury dokumentu.
          </li>
          <li className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
            Nazwę modułu ustawimy na podstawie nazwy pliku.
          </li>
          <li className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
            Przed importem możesz poprawić nazwy i przejrzeć treść.
          </li>
        </ul>
      </aside>
    </div>
  );
}

type ImportPreviewProps = {
  draft: ImportedModuleDraft;
  selectedTopic:
    ImportedModuleDraft["chapters"][number]["topics"][number] | undefined;
  preview: PreviewSelection;
  topicsCount: number;
  isImporting: boolean;
  richTextModule: RichTextModule | null;
  onDraftChange: (draft: ImportedModuleDraft) => void;
  onPreviewChange: (preview: PreviewSelection) => void;
  onErrorClear: () => void;
};

function ImportPreview({
  draft,
  selectedTopic,
  preview,
  topicsCount,
  isImporting,
  richTextModule,
  onDraftChange,
  onPreviewChange,
  onErrorClear,
}: ImportPreviewProps) {
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(
    () => new Set([preview.chapter]),
  );
  const [editingChapter, setEditingChapter] = useState<number | null>(null);

  function updateChapter(chapterIndex: number, title: string) {
    onDraftChange({
      ...draft,
      chapters: draft.chapters.map((chapter, index) =>
        index === chapterIndex ? { ...chapter, title } : chapter,
      ),
    });
    onErrorClear();
  }

  function updateTopic(title: string) {
    onDraftChange({
      ...draft,
      chapters: draft.chapters.map((chapter, chapterIndex) =>
        chapterIndex === preview.chapter
          ? {
              ...chapter,
              topics: chapter.topics.map((topic, topicIndex) =>
                topicIndex === preview.topic ? { ...topic, title } : topic,
              ),
            }
          : chapter,
      ),
    });
    onErrorClear();
  }

  function toggleChapter(chapterIndex: number) {
    setExpandedChapters((current) => {
      const next = new Set(current);
      if (next.has(chapterIndex)) next.delete(chapterIndex);
      else next.add(chapterIndex);
      return next;
    });
  }

  function selectTopic(chapter: number, topic: number) {
    setExpandedChapters((current) => new Set(current).add(chapter));
    onPreviewChange({ chapter, topic });
  }

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-5 overflow-hidden lg:grid-cols-[minmax(20rem,0.85fr)_minmax(22rem,1.15fr)] lg:grid-rows-1">
      <section className="min-h-0 overflow-y-auto rounded-xl border bg-muted/10 p-4 pr-3 sm:p-5">
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
            Wykryto{" "}
            {formatCount(
              draft.chapters.length,
              "rozdział",
              "rozdziały",
              "rozdziałów",
            )}{" "}
            i {formatCount(topicsCount, "temat", "tematy", "tematów")}.
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
        </div>

        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Struktura dokumentu
          </h3>
          <div className="overflow-hidden rounded-lg border bg-background">
            {draft.chapters.map((chapter, chapterIndex) => {
              const hasTopics = chapter.topics.length > 0;
              const expanded = hasTopics && expandedChapters.has(chapterIndex);
              return (
                <div key={chapterIndex} className="border-b last:border-b-0">
                  <div className="flex min-h-11 items-center gap-1 p-1">
                    {editingChapter === chapterIndex ? (
                      <Input
                        autoFocus
                        className="h-8"
                        value={chapter.title}
                        disabled={isImporting}
                        aria-label="Nazwa rozdziału"
                        aria-invalid={!chapter.title.trim()}
                        onBlur={() => setEditingChapter(null)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === "Escape")
                            setEditingChapter(null);
                        }}
                        onChange={(event) =>
                          updateChapter(chapterIndex, event.target.value)
                        }
                      />
                    ) : hasTopics ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-9 min-w-0 flex-1 justify-start px-2"
                        aria-expanded={expanded}
                        onClick={() => toggleChapter(chapterIndex)}
                      >
                        {expanded ? <ChevronDown /> : <ChevronRight />}
                        <BookOpen className="text-primary" />
                        <span className="truncate">{chapter.title}</span>
                      </Button>
                    ) : (
                      <div className="flex h-9 min-w-0 flex-1 items-center gap-2 px-2 text-sm">
                        <BookOpen className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{chapter.title}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          Brak tematów
                        </span>
                      </div>
                    )}
                    {editingChapter !== chapterIndex && (
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        disabled={isImporting}
                        aria-label={`Edytuj nazwę rozdziału ${chapter.title}`}
                        onClick={() => setEditingChapter(chapterIndex)}
                      >
                        <Pencil />
                      </Button>
                    )}
                  </div>
                  {expanded && (
                    <div className="space-y-0.5 border-t bg-muted/10 p-1.5 pl-7">
                      {chapter.topics.map((topic, topicIndex) => {
                        const selected =
                          preview.chapter === chapterIndex &&
                          preview.topic === topicIndex;
                        return (
                          <Button
                            key={topicIndex}
                            type="button"
                            variant={selected ? "secondary" : "ghost"}
                            className="h-auto min-h-8 w-full justify-start px-2 py-1.5 text-left font-normal"
                            aria-pressed={selected}
                            onClick={() =>
                              selectTopic(chapterIndex, topicIndex)
                            }
                          >
                            <FileText className="shrink-0" />
                            <span className="truncate">{topic.title}</span>
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="min-h-0 overflow-y-auto rounded-xl border p-4 sm:p-5">
        {selectedTopic ? (
          <>
            <label className="block space-y-2 text-sm font-medium">
              <span>Nazwa tematu</span>
              <Input
                value={selectedTopic.title}
                disabled={isImporting}
                aria-invalid={!selectedTopic.title.trim()}
                onChange={(event) => updateTopic(event.target.value)}
              />
            </label>
            <div className="mt-5 border-t pt-5">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Podgląd treści
              </h3>
              <div className="mt-3">
                {richTextModule ? (
                  <richTextModule.RichTextViewer
                    key={`${preview.chapter}:${preview.topic}`}
                    content={selectedTopic.content}
                  />
                ) : (
                  <PreviewSkeleton />
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex min-h-64 items-center justify-center text-center text-sm text-muted-foreground">
            Wybierz temat z listy, aby wyświetlić jego treść.
          </div>
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

function formatCount(
  count: number,
  singular: string,
  paucal: string,
  plural: string,
) {
  const lastTwo = count % 100;
  const word =
    count === 1
      ? singular
      : count % 10 >= 2 && count % 10 <= 4 && !(lastTwo >= 12 && lastTwo <= 14)
        ? paucal
        : plural;
  return `${count} ${word}`;
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
