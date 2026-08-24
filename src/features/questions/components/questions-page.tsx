import {
  BookOpenCheck,
  Layers3,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Chapter, Topic } from "@/features/notes/model/types";
import type { QuestionsRepository } from "../data/questions-repository";
import type { Question, StudyMode, StudyScope } from "../model/types";
import { QuestionDialog } from "./question-dialog";

const PAGE_SIZE = 20;
type Props = {
  chapters: Chapter[];
  repository: QuestionsRepository;
  loadTopics: (chapterId: string) => Promise<Topic[] | null>;
  onOpenSession: (mode: StudyMode, id: string) => void;
};

export function QuestionsPage({
  chapters,
  repository,
  loadTopics,
  onOpenSession,
}: Props) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [chapterFilter, setChapterFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [filterTopics, setFilterTopics] = useState<Topic[]>([]);
  const [editing, setEditing] = useState<Question | null | undefined>();
  const [studyMode, setStudyMode] = useState<StudyMode | null>(null);
  const [availability, setAvailability] = useState<{
    flashcardsCount: number;
    testQuestionsCount: number;
  } | null>(null);
  const load = useCallback(async () => {
    try {
      const [result, nextAvailability] = await Promise.all([
        repository.list({
          query,
          chapterId: topicFilter ? undefined : chapterFilter || undefined,
          topicId: topicFilter || undefined,
          offset: (page - 1) * PAGE_SIZE,
          limit: PAGE_SIZE,
        }),
        repository.getAvailability(),
      ]);
      setQuestions(result.questions);
      setTotal(result.total);
      setAvailability(nextAvailability);
    } catch {
      toast.error("Nie udało się pobrać bazy pytań.");
    }
  }, [chapterFilter, page, query, repository, topicFilter]);
  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timeout);
  }, [load]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="mb-2 text-sm font-medium text-primary">Nauka</p>
            <h1 className="text-3xl font-semibold">Baza pytań</h1>
            <p className="mt-2 text-muted-foreground">
              {total} pytań przygotowanych do nauki.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!availability || availability.flashcardsCount === 0}
              title={
                availability?.flashcardsCount === 0
                  ? "Dodaj przynajmniej jedno pytanie."
                  : undefined
              }
              onClick={() => setStudyMode("flashcards")}
            >
              <Layers3 /> Sprawdź się w fiszkach
            </Button>
            <Button
              variant="outline"
              disabled={!availability || availability.testQuestionsCount === 0}
              title={
                availability?.testQuestionsCount === 0
                  ? "Test wymaga pytania z co najmniej dwiema odpowiedziami."
                  : undefined
              }
              onClick={() => setStudyMode("test")}
            >
              <BookOpenCheck /> Rozpocznij test
            </Button>
            <Button onClick={() => setEditing(null)}>
              <Plus /> Dodaj pytanie
            </Button>
          </div>
        </div>
        {availability && availability.flashcardsCount === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            Dodaj pierwsze pytanie, aby rozpocząć naukę z fiszkami.
          </p>
        )}
        {availability &&
          availability.flashcardsCount > 0 &&
          availability.testQuestionsCount === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              Aby rozpocząć test, dodaj do pytania przynajmniej drugą odpowiedź.
            </p>
          )}
        <div className="mt-8 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_minmax(0,16rem)]">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Szukaj pytania"
              className="pl-9"
            />
          </div>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={chapterFilter}
            onChange={(event) => {
              const id = event.target.value;
              setChapterFilter(id);
              setTopicFilter("");
              setFilterTopics([]);
              setPage(1);
              if (id)
                void loadTopics(id).then((items) =>
                  setFilterTopics(items ?? []),
                );
            }}
          >
            <option value="">Wszystkie rozdziały</option>
            {chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {chapter.title}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={topicFilter}
            disabled={!chapterFilter}
            onChange={(event) => {
              setTopicFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Wszystkie tematy</option>
            {filterTopics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.title}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-6 space-y-3">
          {questions.map((question) => {
            const chapter = chapters.find(
              (item) => item.id === question.chapterId,
            );
            return (
              <article key={question.id} className="rounded-xl border p-5">
                <div className="flex gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{question.content}</p>
                    <ol className="mt-3 space-y-1 text-sm">
                      {question.options.map((option, index) => (
                        <li
                          key={option.id ?? index}
                          className={
                            option.isCorrect
                              ? "text-primary"
                              : "text-muted-foreground"
                          }
                        >
                          {String.fromCharCode(65 + index)}. {option.content}
                          {option.isCorrect ? " ✓" : ""}
                        </li>
                      ))}
                    </ol>
                    {question.explanation && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {question.explanation}
                      </p>
                    )}
                    <div className="mt-3 flex gap-2 text-xs">
                      <span className="rounded-full bg-muted px-2 py-1">
                        {question.options.length >= 2
                          ? "Fiszki i test"
                          : "Tylko fiszki"}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-1">
                        {chapter || question.chapterTitle
                          ? `${chapter?.title ?? question.chapterTitle}${question.topicTitle ? ` · ${question.topicTitle}` : ""}`
                          : "Nieprzypisane"}
                      </span>
                    </div>
                  </div>
                  <div className="flex">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setEditing(question)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() =>
                        void repository
                          .remove(question.id)
                          .then(load)
                          .catch(() =>
                            toast.error("Nie udało się usunąć pytania."),
                          )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
          {!questions.length && (
            <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
              Brak pytań.
            </div>
          )}
        </div>
        {pages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Poprzednia
            </Button>
            <span className="text-sm text-muted-foreground">
              {page} / {pages}
            </span>
            <Button
              variant="outline"
              disabled={page === pages}
              onClick={() => setPage((value) => value + 1)}
            >
              Następna
            </Button>
          </div>
        )}
        {editing !== undefined && (
          <QuestionDialog
            question={editing}
            chapters={chapters}
            repository={repository}
            loadTopics={loadTopics}
            onClose={() => setEditing(undefined)}
            onSaved={load}
          />
        )}
        {studyMode && (
          <StudySetup
            mode={studyMode}
            chapters={chapters}
            repository={repository}
            loadTopics={loadTopics}
            onClose={() => setStudyMode(null)}
            onOpenSession={onOpenSession}
          />
        )}
      </div>
    </main>
  );
}

function StudySetup({
  mode,
  chapters,
  repository,
  loadTopics,
  onClose,
  onOpenSession,
}: {
  mode: StudyMode;
  chapters: Chapter[];
  repository: QuestionsRepository;
  loadTopics: (id: string) => Promise<Topic[] | null>;
  onClose: () => void;
  onOpenSession: (mode: StudyMode, id: string) => void;
}) {
  const [scope, setScope] = useState<StudyScope>("all");
  const [chapterId, setChapterId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [count, setCount] = useState("20");
  const [creating, setCreating] = useState(false);
  const [scopeAvailability, setScopeAvailability] = useState<{
    flashcardsCount: number;
    testQuestionsCount: number;
  } | null>(null);
  useEffect(() => {
    if (scope === "chapter" && !chapterId) return;
    if (scope === "topic" && !topicId) return;
    let cancelled = false;
    void repository
      .getAvailability({
        chapterId: scope === "chapter" ? chapterId : undefined,
        topicId: scope === "topic" ? topicId : undefined,
        onlyUnassigned: scope === "unassigned",
      })
      .then((result) => {
        if (!cancelled) setScopeAvailability(result);
      });
    return () => {
      cancelled = true;
    };
  }, [chapterId, repository, scope, topicId]);
  const availableCount =
    mode === "test"
      ? scopeAvailability?.testQuestionsCount
      : scopeAvailability?.flashcardsCount;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "test" ? "Rozpocznij test" : "Rozpocznij fiszki"}
          </DialogTitle>
          <DialogDescription>Wybierz zakres pytań do sesji.</DialogDescription>
        </DialogHeader>
        <label className="space-y-2">
          <span className="font-medium">Zakres</span>
          <select
            className="h-9 w-full rounded-md border bg-background px-3"
            value={scope}
            onChange={(event) => {
              setScopeAvailability(null);
              setScope(event.target.value as StudyScope);
            }}
          >
            <option value="all">Wszystkie rozdziały</option>
            <option value="chapter">Wybrany rozdział</option>
            <option value="topic">Wybrany temat</option>
            <option value="random_chapters">Losowe rozdziały</option>
            <option value="unassigned">Nieprzypisane</option>
          </select>
        </label>
        {(scope === "chapter" || scope === "topic") && (
          <label className="space-y-2">
            <span className="font-medium">Rozdział</span>
            <select
              className="h-9 w-full rounded-md border bg-background px-3"
              value={chapterId}
              onChange={(event) => {
                const id = event.target.value;
                setChapterId(id);
                setTopicId("");
                setScopeAvailability(null);
                void loadTopics(id).then((items) => setTopics(items ?? []));
              }}
            >
              <option value="">Wybierz rozdział</option>
              {chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {scope === "topic" && (
          <label className="space-y-2">
            <span className="font-medium">Temat</span>
            <select
              className="h-9 w-full rounded-md border bg-background px-3"
              value={topicId}
              onChange={(event) => {
                setScopeAvailability(null);
                setTopicId(event.target.value);
              }}
            >
              <option value="">Wybierz temat</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="space-y-2">
          <span className="font-medium">Liczba pytań</span>
          <select
            className="h-9 w-full rounded-md border bg-background px-3"
            value={count}
            onChange={(event) => setCount(event.target.value)}
          >
            <option>10</option>
            <option>20</option>
            <option>50</option>
            <option value="all">Wszystkie</option>
          </select>
        </label>
        {scopeAvailability && (
          <p className="text-sm text-muted-foreground">
            Dostępnych pytań: {availableCount ?? 0}.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Anuluj
          </Button>
          <Button
            disabled={
              creating ||
              !scopeAvailability ||
              availableCount === 0 ||
              (scope === "chapter" && !chapterId) ||
              (scope === "topic" && !topicId)
            }
            onClick={() => {
              setCreating(true);
              void repository
                .createSession({
                  mode,
                  scope,
                  chapterId: chapterId || undefined,
                  topicId: topicId || undefined,
                  randomChapterCount: 3,
                  questionCount: count === "all" ? null : Number(count),
                })
                .then((id) => onOpenSession(mode, id))
                .catch((error: unknown) => {
                  setCreating(false);
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Nie udało się rozpocząć sesji.",
                  );
                });
            }}
          >
            {creating ? "Tworzenie…" : "Rozpocznij"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
