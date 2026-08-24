import { Eye, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Props = {
  isHome: boolean;
  isChapters?: boolean;
  isQuestions?: boolean;
  isQuestionHistory?: boolean;
  chapterTitle?: string;
  topicTitle?: string;
  isEditing: boolean;
  onChangeEditingMode: (isEditing: boolean) => void;
  onPreloadEditor: () => void;
  onOpenAddDialog: () => void;
  onOpenBulkDelete: () => void;
};

export function WorkspaceHeader({
  isHome,
  isChapters,
  isQuestions,
  isQuestionHistory,
  chapterTitle,
  topicTitle,
  isEditing,
  onChangeEditingMode,
  onPreloadEditor,
  onOpenAddDialog,
  onOpenBulkDelete,
}: Props) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger />
        <div className="min-w-0">
          <p className="text-xs font-medium text-primary">
            {isHome || isChapters || isQuestions
              ? "NoteTracker"
              : (chapterTitle ?? "Rozdział")}
          </p>
          <h1 className="truncate font-semibold">
            {isHome
              ? "Strona główna"
              : isChapters
                ? "Wszystkie rozdziały"
                : isQuestions
                  ? isQuestionHistory
                    ? "Historia nauki"
                    : "Baza pytań"
                  : (topicTitle ?? "Wybierz temat")}
          </h1>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isEditing && (
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Usuń wiele rozdziałów lub tematów"
                    onClick={onOpenBulkDelete}
                  />
                }
              >
                <Trash2 />
              </TooltipTrigger>
              <TooltipContent>Usuń wiele</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Dodaj rozdział lub tematy"
                    onClick={onOpenAddDialog}
                  />
                }
              >
                <Plus />
              </TooltipTrigger>
              <TooltipContent>Dodaj zawartość</TooltipContent>
            </Tooltip>
          </div>
        )}
        <div
          role="group"
          aria-label="Tryb pracy"
          className="flex rounded-md bg-muted/60 p-0.5"
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Włącz tryb podglądu"
                  aria-pressed={!isEditing}
                  className={
                    !isEditing
                      ? "bg-background text-foreground shadow-xs hover:bg-background"
                      : "text-muted-foreground"
                  }
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
                  aria-label="Włącz tryb edycji"
                  aria-pressed={isEditing}
                  className={
                    isEditing
                      ? "bg-background text-foreground shadow-xs hover:bg-background"
                      : "text-muted-foreground"
                  }
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
    </header>
  );
}
