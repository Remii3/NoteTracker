import { useEffect, useState } from "react";
import {
  ChevronDown,
  Copy,
  LoaderCircle,
  RefreshCw,
  Save,
  Sparkles,
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
import { toast } from "@/components/ui/toast";
import type { Chapter, Topic } from "@/features/notes/types/model";
import type { SummaryGenerationService } from "../data/summary-generation-service";
import type {
  GeneratedSummaryResult,
  SavedSummaryNote,
  SummaryLength,
} from "../model/types";
import {
  summaryToNoteContent,
  summaryToPlainText,
} from "../model/summary-content";

type Props = {
  moduleId: string;
  chapters: Chapter[];
  service: SummaryGenerationService;
  loadTopics: (chapterId: string) => Promise<Topic[] | null>;
  onClose: () => void;
  onSaved: (note: SavedSummaryNote) => Promise<void>;
};

const LENGTH_LABELS: Record<SummaryLength, string> = {
  short: "Krótkie",
  standard: "Standardowe",
  detailed: "Szczegółowe",
};

export function AiSummaryDialog({
  moduleId,
  chapters,
  service,
  loadTopics,
  onClose,
  onSaved,
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
  const [length, setLength] = useState<SummaryLength>("standard");
  const [maxTopics, setMaxTopics] = useState(5);
  const [result, setResult] = useState<GeneratedSummaryResult | null>(null);
  const [title, setTitle] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

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

  async function generate(regenerate = false) {
    if (!selectedTopicIds.size) return;
    setGenerating(true);
    try {
      const next = await service.generate({
        moduleId,
        topicIds: [...selectedTopicIds],
        length,
        regenerate,
      });
      setMaxTopics(next.maxTopics);
      setResult(next);
      setTitle(next.summary.suggestedTitle);
      setStep("preview");
      if (next.cached) {
        toast.add({
          data: { type: "success" },
          description: "Wykorzystano zapisane streszczenie tego zakresu.",
        });
      }
    } catch (error) {
      toast.add({
        data: { type: "error" },
        description:
          error instanceof Error
            ? error.message
            : "Nie udało się wygenerować streszczenia.",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function copySummary() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(
        summaryToPlainText(title.trim(), result.summary, result.sourceTopics),
      );
      toast.add({
        data: { type: "success" },
        description: "Skopiowano streszczenie.",
      });
    } catch {
      toast.add({
        data: { type: "error" },
        description: "Nie udało się skopiować streszczenia.",
      });
    }
  }

  async function saveSummary() {
    if (!result) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle || trimmedTitle.length > 160) {
      toast.add({
        data: { type: "error" },
        description: "Nazwa tematu musi mieć od 1 do 160 znaków.",
      });
      return;
    }
    setSaving(true);
    try {
      const saved = await service.save({
        moduleId,
        title: trimmedTitle,
        content: summaryToNoteContent(result.summary, result.sourceTopics),
      });
      await onSaved(saved);
      toast.add({
        data: { type: "success" },
        description: "Zapisano w rozdziale „Streszczenia AI”.",
      });
      onClose();
    } catch (error) {
      toast.add({
        data: { type: "error" },
        description:
          error instanceof Error
            ? error.message
            : "Nie udało się zapisać streszczenia.",
      });
    } finally {
      setSaving(false);
    }
  }

  const busy = generating || saving;
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="flex h-[min(52rem,calc(100dvh-2rem))] w-[min(70rem,calc(100vw-2rem))] max-w-none flex-col overflow-hidden sm:max-w-fit">
        <DialogHeader>
          <DialogTitle>Streszcz zakres z AI</DialogTitle>
          <DialogDescription>
            {step === "scope"
              ? `Wybierz maksymalnie ${maxTopics} tematów. AI wykorzysta wyłącznie tekst notatek.`
              : "Sprawdź streszczenie, skopiuj je albo zapisz jako nowy temat."}
          </DialogDescription>
        </DialogHeader>

        {step === "scope" ? (
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="mb-5 flex flex-wrap items-end gap-4 rounded-xl border p-4">
              <label className="space-y-2">
                <span className="block font-medium">Długość</span>
                <select
                  className="h-9 rounded-md border bg-background px-3"
                  value={length}
                  onChange={(event) =>
                    setLength(event.target.value as SummaryLength)
                  }
                >
                  {Object.entries(LENGTH_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
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
                        {loadingChapterIds.has(chapter.id) && (
                          <LoaderCircle className="animate-spin" />
                        )}
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
        ) : result ? (
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
            <label className="block space-y-2">
              <span className="font-medium">Nazwa nowego tematu</span>
              <Input
                value={title}
                maxLength={160}
                disabled={busy}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <article className="space-y-6 rounded-xl border p-5">
              <p className="whitespace-pre-wrap">
                {result.summary.introduction}
              </p>
              {result.summary.sections.map((section, index) => (
                <section
                  key={`${section.title}-${index}`}
                  className="space-y-3"
                >
                  <h3 className="text-lg font-semibold">{section.title}</h3>
                  <p className="whitespace-pre-wrap text-sm leading-6">
                    {section.summary}
                  </p>
                  {section.keyPoints.length > 0 && (
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                      {section.keyPoints.map((point, pointIndex) => (
                        <li key={`${point}-${pointIndex}`}>{point}</li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
              {result.summary.connections.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-lg font-semibold">
                    Powiązania między tematami
                  </h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {result.summary.connections.map((item, index) => (
                      <li key={`${item}-${index}`}>{item}</li>
                    ))}
                  </ul>
                </section>
              )}
              {result.summary.thingsToRemember.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-lg font-semibold">
                    Najważniejsze do zapamiętania
                  </h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {result.summary.thingsToRemember.map((item, index) => (
                      <li key={`${item}-${index}`}>{item}</li>
                    ))}
                  </ul>
                </section>
              )}
              <p className="text-xs text-muted-foreground">
                Źródła:{" "}
                {result.sourceTopics
                  .map(
                    (source) => `${source.chapterTitle} — ${source.topicTitle}`,
                  )
                  .join(", ")}
              </p>
            </article>
          </div>
        ) : null}

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
                {generating ? "Generowanie…" : "Generuj streszczenie"}
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
                variant="outline"
                disabled={busy || !result}
                onClick={() => void copySummary()}
              >
                <Copy /> Kopiuj
              </Button>
              <Button
                variant="outline"
                disabled={busy || !result}
                onClick={() => void generate(true)}
              >
                {generating ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <RefreshCw />
                )}
                Generuj ponownie
              </Button>
              <Button
                disabled={busy || !result || !title.trim()}
                onClick={() => void saveSummary()}
              >
                {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
                {saving ? "Zapisywanie…" : "Zapisz jako notatkę"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
