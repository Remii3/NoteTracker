import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Trash2,
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
import { toast } from "@/components/ui/toast";
import type { Chapter, Topic } from "@/features/notes/types/model";
import type { QuestionGenerationService } from "../data/question-generation-service";
import type { QuestionsRepository } from "../data/questions-repository";
import {
  createQuestionFormValue,
  validateQuestionForm,
  type QuestionFormValue,
} from "../model/question-form";
import type {
  GeneratedQuestionProposal,
  GeneratedTopicQuestions,
} from "../model/types";
import { QuestionFormFields } from "./question-form-fields";

type Props = {
  moduleId: string;
  chapters: Chapter[];
  service: QuestionGenerationService;
  repository: QuestionsRepository;
  loadTopics: (chapterId: string) => Promise<Topic[] | null>;
  onClose: () => void;
  onApproved: () => Promise<void>;
};

export function AiQuestionGenerationDialog({
  moduleId,
  chapters,
  service,
  repository,
  loadTopics,
  onClose,
  onApproved,
}: Props) {
  const [step, setStep] = useState<"scope" | "preview">("scope");
  const [topicsByChapter, setTopicsByChapter] = useState<
    Record<string, Topic[]>
  >({});
  const [loadingChapterIds, setLoadingChapterIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(
    new Set(),
  );
  const [questionCount, setQuestionCount] = useState(3);
  const [maxTopics, setMaxTopics] = useState(5);
  const [generatedTopics, setGeneratedTopics] = useState<
    GeneratedTopicQuestions[]
  >([]);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rerollingId, setRerollingId] = useState<string | null>(null);
  const questions = useMemo(
    () => generatedTopics.flatMap((topic) => topic.questions),
    [generatedTopics],
  );

  useEffect(() => {
    let cancelled = false;
    void service
      .getConfig()
      .then((config) => {
        if (!cancelled) setMaxTopics(config.maxTopics);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [service]);

  async function ensureTopics(chapterId: string) {
    if (topicsByChapter[chapterId]) return topicsByChapter[chapterId];
    setLoadingChapterIds((current) => new Set(current).add(chapterId));
    try {
      const topics = await loadTopics(chapterId);
      if (!topics) throw new Error("Nie udało się pobrać tematów.");
      setTopicsByChapter((current) => ({ ...current, [chapterId]: topics }));
      return topics;
    } catch (error) {
      toast.add({
        data: { type: "error" },
        description:
          error instanceof Error
            ? error.message
            : "Nie udało się pobrać tematów.",
      });
      return null;
    } finally {
      setLoadingChapterIds((current) => {
        const next = new Set(current);
        next.delete(chapterId);
        return next;
      });
    }
  }

  function toggleTopic(topicId: string) {
    setSelectedTopicIds((current) => {
      const next = new Set(current);
      if (next.has(topicId)) next.delete(topicId);
      else if (next.size < maxTopics) next.add(topicId);
      else
        toast.add({
          data: { type: "error" },
          description: `Możesz wybrać maksymalnie ${maxTopics} tematów.`,
        });
      return next;
    });
  }

  async function toggleChapter(chapterId: string) {
    const topics = await ensureTopics(chapterId);
    if (!topics?.length) return;
    const ids = topics.map((topic) => topic.id);
    setSelectedTopicIds((current) => {
      const next = new Set(current);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
        return next;
      }
      const missing = ids.filter((id) => !next.has(id));
      if (next.size + missing.length > maxTopics) {
        toast.add({
          data: { type: "error" },
          description: `Cały rozdział przekracza limit ${maxTopics} tematów. Wybierz tematy pojedynczo.`,
        });
        return current;
      }
      missing.forEach((id) => next.add(id));
      return next;
    });
  }

  async function generate() {
    if (!selectedTopicIds.size) return;
    setGenerating(true);
    try {
      const result = await service.generate({
        moduleId,
        topicIds: [...selectedTopicIds],
        questionCount,
      });
      setMaxTopics(result.maxTopics);
      setGeneratedTopics(result.topics);
      setStep("preview");
      const cachedCount = result.topics.filter((topic) => topic.cached).length;
      if (cachedCount) {
        toast.add({
          data: { type: "success" },
          description: `Wykorzystano zapisane propozycje dla ${cachedCount} ${cachedCount === 1 ? "tematu" : "tematów"}.`,
        });
      }
    } catch (error) {
      toast.add({
        data: { type: "error" },
        description:
          error instanceof Error
            ? error.message
            : "Nie udało się wygenerować pytań.",
      });
    } finally {
      setGenerating(false);
    }
  }

  function updateQuestion(id: string, form: QuestionFormValue) {
    setGeneratedTopics((current) =>
      current.map((topic) => ({
        ...topic,
        questions: topic.questions.map((question) =>
          question.id === id
            ? {
                ...question,
                content: form.content,
                explanation: form.explanation,
                options: form.options,
              }
            : question,
        ),
      })),
    );
  }

  function removeQuestion(id: string) {
    setGeneratedTopics((current) =>
      current
        .map((topic) => ({
          ...topic,
          questions: topic.questions.filter((question) => question.id !== id),
        }))
        .filter((topic) => topic.questions.length > 0),
    );
  }

  async function reroll(question: GeneratedQuestionProposal) {
    const topic = generatedTopics.find(
      (item) => item.topicId === question.topicId,
    );
    if (!topic) return;
    setRerollingId(question.id);
    try {
      const replacement = await service.reroll({
        moduleId,
        topicId: question.topicId,
        replaceId: question.id,
        currentQuestions: topic.questions,
      });
      setGeneratedTopics((current) =>
        current.map((item) =>
          item.topicId === question.topicId
            ? {
                ...item,
                cached: false,
                questions: item.questions.map((candidate) =>
                  candidate.id === question.id ? replacement : candidate,
                ),
              }
            : item,
        ),
      );
    } catch (error) {
      toast.add({
        data: { type: "error" },
        description:
          error instanceof Error
            ? error.message
            : "Nie udało się wygenerować pytania ponownie.",
      });
    } finally {
      setRerollingId(null);
    }
  }

  async function approve() {
    if (!questions.length) return;
    const invalid = questions.find((question) =>
      validateQuestionForm(createQuestionFormValue(question)),
    );
    if (invalid) {
      toast.add({
        data: { type: "error" },
        description:
          validateQuestionForm(createQuestionFormValue(invalid)) ??
          "Popraw nieprawidłowe pytanie.",
      });
      return;
    }
    setApproving(true);
    try {
      const result = await repository.approveGeneratedQuestions(
        questions.map((question) => ({
          topicId: question.topicId,
          content: question.content,
          explanation: question.explanation,
          options: question.options,
        })),
      );
      toast.add({
        data: { type: "success" },
        description: `Utworzono: ${result.created}. Pominięto duplikaty: ${result.duplicatesSkipped}.`,
      });
      await onApproved();
      onClose();
    } catch (error) {
      toast.add({
        data: { type: "error" },
        description:
          error instanceof Error
            ? error.message
            : "Nie udało się zapisać pytań.",
      });
      setApproving(false);
    }
  }

  const busy = generating || approving || rerollingId !== null;
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="flex h-[min(52rem,calc(100dvh-2rem))] w-[min(70rem,calc(100vw-2rem))] max-w-none flex-col overflow-hidden sm:max-w-fit">
        <DialogHeader>
          <DialogTitle>Generuj pytania z AI</DialogTitle>
          <DialogDescription>
            {step === "scope"
              ? `Wybierz maksymalnie ${maxTopics} tematów. AI skorzysta wyłącznie z tekstu notatek.`
              : "Sprawdź i popraw propozycje przed dodaniem ich do bazy pytań."}
          </DialogDescription>
        </DialogHeader>

        {step === "scope" ? (
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="mb-5 flex flex-wrap items-end gap-4 rounded-xl border p-4">
              <label className="space-y-2">
                <span className="block font-medium">Pytania na temat</span>
                <select
                  className="h-9 rounded-md border bg-background px-3"
                  value={questionCount}
                  onChange={(event) =>
                    setQuestionCount(Number(event.target.value))
                  }
                >
                  {Array.from({ length: 10 }, (_, index) => index + 1).map(
                    (count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <p className="text-sm text-muted-foreground">
                Wybrano {selectedTopicIds.size} / {maxTopics} tematów
              </p>
            </div>
            <div className="space-y-3">
              {chapters.map((chapter) => {
                const topics = topicsByChapter[chapter.id];
                const selectedInChapter = topics?.filter((topic) =>
                  selectedTopicIds.has(topic.id),
                ).length;
                return (
                  <details
                    key={chapter.id}
                    className="group rounded-xl border px-4"
                    onToggle={(event) => {
                      if ((event.currentTarget as HTMLDetailsElement).open)
                        void ensureTopics(chapter.id);
                    }}
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-3 py-4">
                      <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                      <span className="min-w-0 flex-1 font-medium">
                        {chapter.title}
                      </span>
                      {selectedInChapter ? (
                        <span className="text-xs text-muted-foreground">
                          Wybrano: {selectedInChapter}
                        </span>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={loadingChapterIds.has(chapter.id)}
                        onClick={(event) => {
                          event.preventDefault();
                          void toggleChapter(chapter.id);
                        }}
                      >
                        {loadingChapterIds.has(chapter.id) ? (
                          <LoaderCircle className="animate-spin" />
                        ) : null}
                        {topics?.length &&
                        topics.every((topic) => selectedTopicIds.has(topic.id))
                          ? "Odznacz cały"
                          : "Wybierz cały"}
                      </Button>
                    </summary>
                    <div className="space-y-2 pb-4 pl-7">
                      {loadingChapterIds.has(chapter.id) && !topics ? (
                        <p className="text-sm text-muted-foreground">
                          Wczytywanie tematów…
                        </p>
                      ) : topics?.length ? (
                        topics.map((topic) => (
                          <label
                            key={topic.id}
                            className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted"
                          >
                            <input
                              type="checkbox"
                              checked={selectedTopicIds.has(topic.id)}
                              onChange={() => toggleTopic(topic.id)}
                            />
                            <span>{topic.title}</span>
                          </label>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Ten rozdział nie ma tematów.
                        </p>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="space-y-7">
              {generatedTopics.map((topic) => (
                <section key={topic.topicId}>
                  <div className="mb-3 flex items-center gap-2">
                    <h3 className="font-semibold">
                      {topic.chapterTitle} · {topic.topicTitle}
                    </h3>
                    {topic.cached && (
                      <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                        Zapisane
                      </span>
                    )}
                  </div>
                  <div className="space-y-4">
                    {topic.questions.map((question, index) => (
                      <article
                        key={question.id}
                        className="rounded-xl border p-5"
                      >
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <span className="font-medium">
                            Pytanie {index + 1}
                          </span>
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void reroll(question)}
                            >
                              {rerollingId === question.id ? (
                                <LoaderCircle className="animate-spin" />
                              ) : (
                                <RefreshCw />
                              )}
                              Generuj ponownie
                            </Button>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label="Usuń propozycję"
                              disabled={busy}
                              onClick={() => removeQuestion(question.id)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </div>
                        <QuestionFormFields
                          idPrefix={`ai-${question.id}`}
                          value={createQuestionFormValue(question)}
                          disabled={busy}
                          onChange={(form) => updateQuestion(question.id, form)}
                        />
                      </article>
                    ))}
                  </div>
                </section>
              ))}
              {!questions.length && (
                <div className="rounded-xl border border-dashed py-12 text-center text-muted-foreground">
                  Wszystkie propozycje zostały usunięte.
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "scope" ? (
            <>
              <Button variant="outline" disabled={busy} onClick={onClose}>
                Anuluj
              </Button>
              <Button
                disabled={busy || selectedTopicIds.size === 0}
                onClick={() => void generate()}
              >
                {generating ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Sparkles />
                )}
                {generating ? "Generowanie…" : "Generuj propozycje"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setStep("scope")}
              >
                Zmień zakres
              </Button>
              <Button
                disabled={busy || questions.length === 0}
                onClick={() => void approve()}
              >
                {approving && <LoaderCircle className="animate-spin" />}
                {approving
                  ? "Zapisywanie…"
                  : `Zatwierdź wszystkie (${questions.length})`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
