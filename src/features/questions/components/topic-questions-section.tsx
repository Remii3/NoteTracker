import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Chapter, Topic } from "@/features/notes/model/types";
import type { QuestionsRepository } from "../data/questions-repository";
import type { Question } from "../model/types";
import { QuestionDialog } from "./question-dialog";

type Props = {
  chapter: Chapter;
  topic: Topic;
  isEditing: boolean;
  chapters: Chapter[];
  repository?: QuestionsRepository;
  loadTopics: (chapterId: string) => Promise<Topic[] | null>;
};

export function TopicQuestionsSection({
  chapter,
  topic,
  isEditing,
  chapters,
  repository,
  loadTopics,
}: Props) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editing, setEditing] = useState<Question | null | undefined>();
  const load = useCallback(async () => {
    if (!repository) return;
    try {
      setQuestions(
        (await repository.list({ topicId: topic.id, limit: 100 })).questions,
      );
    } catch {
      toast.error("Nie udało się pobrać pytań.");
    }
  }, [repository, topic.id]);
  useEffect(() => {
    if (!repository) return;
    let cancelled = false;
    void repository
      .list({ topicId: topic.id, limit: 100 })
      .then((result) => {
        if (!cancelled) setQuestions(result.questions);
      })
      .catch(() => toast.error("Nie udało się pobrać pytań."));
    return () => {
      cancelled = true;
    };
  }, [repository, topic.id]);
  if (!repository) return null;
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Pytania</h3>
          <p className="text-sm text-muted-foreground">
            {questions.length} pytań w tym temacie
          </p>
        </div>
        {isEditing && (
          <Button size="sm" onClick={() => setEditing(null)}>
            <Plus /> Dodaj pytanie
          </Button>
        )}
      </div>
      {!questions.length ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Ten temat nie ma jeszcze pytań.
        </div>
      ) : (
        <div className="space-y-2">
          {questions.map((question) => (
            <article key={question.id} className="rounded-xl border p-4">
              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{question.content}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {
                      question.options.find((option) => option.isCorrect)
                        ?.content
                    }
                  </p>
                  <span className="mt-3 inline-block rounded-full bg-muted px-2 py-1 text-xs">
                    {question.options.length >= 2
                      ? "Fiszki i test"
                      : "Tylko fiszki"}
                  </span>
                </div>
                {isEditing && (
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
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {editing !== undefined && (
        <QuestionDialog
          question={editing}
          chapters={chapters}
          initialChapterId={chapter.id}
          initialTopicId={topic.id}
          repository={repository}
          loadTopics={loadTopics}
          onClose={() => setEditing(undefined)}
          onSaved={load}
        />
      )}
    </section>
  );
}
