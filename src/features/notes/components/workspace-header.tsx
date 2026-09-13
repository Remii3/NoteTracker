import { Eye, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Props = {
  moduleName?: string;
  isChapters?: boolean;
  isGallery?: boolean;
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
  moduleName,
  isChapters,
  isGallery,
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
  const viewTitle = isChapters
    ? "Wszystkie rozdziały"
    : isGallery
      ? "Galeria"
      : isQuestions
        ? isQuestionHistory
          ? "Historia nauki"
          : "Baza pytań"
        : `${chapterTitle ?? "Rozdział"} / ${topicTitle ?? "Wybierz temat"}`;
  const compactViewTitle =
    !isChapters && !isGallery && !isQuestions && topicTitle
      ? topicTitle
      : viewTitle;

  return (
    <>
      <div
        className="min-w-0 flex-1 overflow-hidden"
        aria-label={`${moduleName ?? "Moduł"}: ${viewTitle}`}
      >
        <p className="hidden truncate text-xs font-medium text-primary min-[480px]:block">
          {moduleName ?? "Moduł"}
        </p>
        <h1 className="truncate text-sm font-semibold min-[480px]:hidden">
          {moduleName ?? "Moduł"} · {compactViewTitle}
        </h1>
        <h1 className="hidden truncate font-semibold min-[480px]:block">
          {viewTitle}
        </h1>
      </div>
      {!isGallery && (
        <div className="flex h-8 shrink-0 items-center gap-2">
          {isEditing && (
            <>
              <div className="hidden items-center gap-1 sm:flex">
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
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="sm:hidden"
                      aria-label="Więcej działań edycji"
                    />
                  }
                >
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onOpenAddDialog}>
                    <Plus />
                    Dodaj zawartość
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={onOpenBulkDelete}
                  >
                    <Trash2 />
                    Usuń wiele
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          <div
            role="group"
            aria-label="Tryb pracy"
            className="flex h-8 items-center rounded-md bg-muted/60 p-0.5"
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
                        ? "h-7 bg-background text-foreground shadow-xs hover:bg-background"
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
                        ? "h-7 bg-background text-foreground shadow-xs hover:bg-background"
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
