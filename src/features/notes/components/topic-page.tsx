import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { TopicImagesService } from "../data/topic-images-service";
import type { Chapter, NoteContent, Topic } from "../model/types";
import { TopicImagesSection } from "./topic-images-section";
import { TopicQuestionsSection } from "@/features/questions/components/topic-questions-section";
import type { QuestionsRepository } from "@/features/questions/data/questions-repository";

type RichTextModule = typeof import("./rich-text-editor");

type Props = {
  chapter?: Chapter;
  topic?: Topic;
  isEditing: boolean;
  content: NoteContent;
  editorDirty: boolean;
  isSaving: boolean;
  richTextModule: RichTextModule | null;
  imagesService?: TopicImagesService;
  questionsRepository?: QuestionsRepository;
  chapters: Chapter[];
  loadChapterTopics: (chapterId: string) => Promise<Topic[] | null>;
  onContentChange: (content: NoteContent) => void;
  onSaveContent: () => void;
  onToggleCompleted: (completed: boolean) => void;
  onAddContent: () => void;
};

export function TopicPage({
  chapter,
  topic,
  isEditing,
  content,
  editorDirty,
  isSaving,
  richTextModule,
  imagesService,
  questionsRepository,
  chapters,
  loadChapterTopics,
  onContentChange,
  onSaveContent,
  onToggleCompleted,
  onAddContent,
}: Props) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      {chapter && topic ? (
        <div className="mx-auto max-w-6xl space-y-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="mb-2 text-sm font-medium text-primary">
                {chapter.title}
              </p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {topic.title}
              </h2>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={topic.completed}
                onCheckedChange={onToggleCompleted}
              />
              Ukończone
            </label>
          </div>
          <section>
            {isEditing ? (
              <>
                <h3 className="mb-2 block text-sm font-medium">Notatka</h3>
                <div id="note-editor">
                  {richTextModule ? (
                    <richTextModule.RichTextEditor
                      key={topic.id}
                      content={content}
                      onChange={onContentChange}
                    />
                  ) : (
                    <RichTextEditorSkeleton />
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {isSaving
                      ? "Zapisywanie…"
                      : editorDirty
                        ? "Masz niezapisane zmiany."
                        : "Zapisano."}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!editorDirty || isSaving}
                    onClick={onSaveContent}
                  >
                    {isSaving ? "Zapisywanie…" : "Zapisz zmiany"}
                  </Button>
                </div>
              </>
            ) : (
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <h3 className="text-sm font-medium">Notatka</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    Podgląd
                  </span>
                </div>
                {richTextModule ? (
                  <richTextModule.RichTextViewer
                    key={topic.id}
                    content={content}
                  />
                ) : (
                  <RichTextViewerSkeleton />
                )}
              </div>
            )}
          </section>
          <TopicImagesSection
            key={topic.id}
            topicId={topic.id}
            isEditing={isEditing}
            service={imagesService}
          />
          <TopicQuestionsSection
            key={`questions-${topic.id}`}
            chapter={chapter}
            topic={topic}
            isEditing={isEditing}
            chapters={chapters}
            repository={questionsRepository}
            loadTopics={loadChapterTopics}
          />
        </div>
      ) : (
        <div className="grid min-h-[70dvh] place-items-center">
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              {chapter
                ? "Ten rozdział nie ma jeszcze tematów"
                : "Nie masz jeszcze żadnych rozdziałów"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isEditing
                ? "Użyj wspólnego przycisku dodawania w panelu bocznym."
                : "Przejdź do trybu edycji, aby dodać zawartość."}
            </p>
            {isEditing && (
              <Button className="mt-4" onClick={onAddContent}>
                <Plus /> Dodaj zawartość
              </Button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function RichTextEditorSkeleton() {
  return (
    <div
      aria-label="Ładowanie edytora"
      className="min-h-72 animate-pulse overflow-hidden rounded-md border"
    >
      <div className="flex h-10 items-center gap-1 border-b bg-muted/30 px-2">
        {Array.from({ length: 10 }, (_, index) => (
          <span key={index} className="size-6 rounded bg-muted" />
        ))}
      </div>
      <div className="space-y-3 p-4">
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-5/6 rounded bg-muted" />
        <div className="h-4 w-2/3 rounded bg-muted" />
      </div>
    </div>
  );
}

function RichTextViewerSkeleton() {
  return (
    <div
      aria-label="Ładowanie notatki"
      className="min-h-40 animate-pulse space-y-3"
    >
      <div className="h-4 w-3/4 rounded bg-muted" />
      <div className="h-4 w-full rounded bg-muted" />
      <div className="h-4 w-5/6 rounded bg-muted" />
    </div>
  );
}
