import { Check, Circle, Eye, LoaderCircle, Pencil } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  moduleName?: string;
  isChapters?: boolean;
  isGallery?: boolean;
  isQuestions?: boolean;
  isStatistics?: boolean;
  isQuestionHistory?: boolean;
  studyMode?: "flashcards" | "test";
  chapterTitle?: string;
  topicTitle?: string;
  showEditingMode: boolean;
  isEditing: boolean;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  onChangeEditingMode: (isEditing: boolean) => void;
  onPreloadEditor: () => void;
};

export function WorkspaceHeader({
  showEditingMode,
  isEditing,
  isSaving,
  hasUnsavedChanges,
  onChangeEditingMode,
  onPreloadEditor,
}: Props) {
  const [showSaved, setShowSaved] = useState(false);
  const wasSaving = useRef(false);

  useEffect(() => {
    if (isSaving) {
      wasSaving.current = true;
      return;
    }
    if (!wasSaving.current) return;

    wasSaving.current = false;
    const showTimeout = window.setTimeout(() => setShowSaved(true), 0);
    const hideTimeout = window.setTimeout(() => setShowSaved(false), 2000);
    return () => {
      window.clearTimeout(showTimeout);
      window.clearTimeout(hideTimeout);
    };
  }, [isSaving]);

  const saveStatus = isSaving
    ? { label: "Zapisywanie…", Icon: LoaderCircle }
    : hasUnsavedChanges
      ? { label: "Niezapisane zmiany", Icon: Circle }
      : showSaved
        ? { label: "Zapisano", Icon: Check }
        : null;

  return (
    <>
      {showEditingMode && isEditing && saveStatus ? (
        <div className="flex h-8 shrink-0 items-center gap-2">
          <span role="status" aria-live="polite" className="sr-only">
            {saveStatus.label}
          </span>
          <span
            aria-hidden="true"
            className="hidden items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground lg:inline-flex"
          >
            <saveStatus.Icon
              className={
                isSaving
                  ? "size-3.5 animate-spin motion-reduce:animate-none"
                  : hasUnsavedChanges
                    ? "size-2 fill-current"
                    : "size-3.5 text-primary dark:text-chart-2"
              }
            />
            {saveStatus.label}
          </span>
        </div>
      ) : null}
      {showEditingMode && (
        <div className="flex h-8 shrink-0 items-center gap-2 sm:gap-3">
          <div
            role="group"
            aria-label="Tryb pracy"
            className="flex h-8 items-center rounded-md bg-muted/70 p-0.5 ring-1 ring-inset ring-border/70"
          >
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={
                      !isEditing
                        ? "h-7 bg-background text-foreground shadow-xs ring-1 ring-inset ring-border/60 hover:bg-background"
                        : "h-7 text-muted-foreground"
                    }
                    aria-label="Włącz tryb podglądu"
                    aria-pressed={!isEditing}
                    onClick={() => onChangeEditingMode(false)}
                  />
                }
              >
                <Eye className="size-3.5" />
                <span className="hidden sm:inline">Podgląd</span>
              </TooltipTrigger>
              <TooltipContent className="sm:hidden">Podgląd</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={
                      isEditing
                        ? "h-7 bg-background text-foreground shadow-xs ring-1 ring-inset ring-border/60 hover:bg-background"
                        : "h-7 text-muted-foreground"
                    }
                    aria-label="Włącz tryb edycji"
                    aria-pressed={isEditing}
                    onClick={() => onChangeEditingMode(true)}
                    onPointerEnter={onPreloadEditor}
                    onFocus={onPreloadEditor}
                    onTouchStart={onPreloadEditor}
                  />
                }
              >
                <Pencil className="size-3.5" />
                <span className="hidden sm:inline">Edycja</span>
              </TooltipTrigger>
              <TooltipContent className="sm:hidden">Edycja</TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}
    </>
  );
}
