import { ImagePlus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Chapter, NoteContent, Topic } from "../model/types";

type RichTextModule = typeof import("./rich-text-editor");

type Props = {
  chapter?: Chapter;
  topic?: Topic;
  isEditing: boolean;
  content: NoteContent;
  editorDirty: boolean;
  isSaving: boolean;
  richTextModule: RichTextModule | null;
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
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Zdjęcia</h3>
                <p className="text-sm text-muted-foreground">
                  Prywatne, widoczne tylko dla Ciebie.
                </p>
              </div>
              {isEditing && (
                <Button variant="outline" size="sm">
                  <ImagePlus /> Dodaj zdjęcie
                </Button>
              )}
            </div>
            {isEditing ? (
              <Button
                variant="outline"
                className="flex h-52 w-full flex-col border-dashed bg-muted/20 hover:bg-muted/50"
              >
                <ImagePlus className="mb-3 size-7 text-muted-foreground" />
                <span>Przeciągnij zdjęcia tutaj</span>
                <span className="text-xs font-normal text-muted-foreground">
                  albo kliknij, aby wybrać pliki
                </span>
              </Button>
            ) : (
              <div className="grid h-52 place-items-center rounded-lg border border-dashed bg-muted/20 text-sm text-muted-foreground">
                Brak zdjęć.
              </div>
            )}
          </section>
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
