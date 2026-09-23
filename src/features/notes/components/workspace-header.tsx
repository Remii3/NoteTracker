import {
  AlertTriangle,
  Check,
  Circle,
  Cloud,
  CloudOff,
  Eye,
  LoaderCircle,
  Pencil,
  RefreshCw,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

export type NoteSyncStatus = {
  isOnline: boolean;
  pendingCount: number;
  conflictCount: number;
  isSyncing: boolean;
  error: string | null;
  lastSyncedAt: string | null;
  onRetry: () => void;
  onOpenConflicts: () => void;
};

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
  syncStatus?: NoteSyncStatus;
};

export function WorkspaceHeader({
  showEditingMode,
  isEditing,
  isSaving,
  hasUnsavedChanges,
  onChangeEditingMode,
  onPreloadEditor,
  syncStatus,
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
      {syncStatus && <SyncIndicator status={syncStatus} />}
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

function SyncIndicator({ status }: { status: NoteSyncStatus }) {
  const presentation = getSyncPresentation(status);
  const Icon = presentation.Icon;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant={
              status.conflictCount || status.error ? "destructive" : "outline"
            }
            aria-label={`Synchronizacja: ${presentation.label}`}
          />
        }
      >
        <Icon
          className={
            status.isSyncing ? "animate-spin motion-reduce:animate-none" : ""
          }
        />
        <span className="hidden md:inline">{presentation.label}</span>
        {status.pendingCount > 0 && (
          <span className="rounded-full bg-foreground/10 px-1.5 text-xs tabular-nums">
            {status.pendingCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>Synchronizacja notatek</PopoverTitle>
        </PopoverHeader>
        <div className="space-y-2 text-sm">
          <p>{presentation.description}</p>
          {status.lastSyncedAt && (
            <p className="text-xs text-muted-foreground">
              Ostatnia synchronizacja: {formatSyncDate(status.lastSyncedAt)}
            </p>
          )}
          {status.error && (
            <p role="alert" className="text-xs text-destructive">
              {status.error}
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {status.conflictCount > 0 && (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={status.onOpenConflicts}
            >
              Rozwiąż konflikt
            </Button>
          )}
          {(status.pendingCount > status.conflictCount || status.error) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!status.isOnline || status.isSyncing}
              onClick={status.onRetry}
            >
              <RefreshCw />
              Spróbuj ponownie
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function getSyncPresentation(status: NoteSyncStatus) {
  if (status.conflictCount)
    return {
      label: "Konflikt",
      description:
        "Wersja lokalna i serwerowa różnią się. Wybierz, którą zachować.",
      Icon: AlertTriangle,
    };
  if (status.error)
    return {
      label: "Błąd synchronizacji",
      description: "Nie udało się wysłać wszystkich lokalnych zmian.",
      Icon: AlertTriangle,
    };
  if (status.isSyncing)
    return {
      label: "Synchronizacja…",
      description: "Wysyłamy lokalne zmiany na serwer.",
      Icon: LoaderCircle,
    };
  if (!status.isOnline)
    return {
      label: status.pendingCount ? "Zapisano lokalnie" : "Offline",
      description: status.pendingCount
        ? "Zmiany są bezpieczne na tym urządzeniu i czekają na połączenie."
        : "Brak połączenia z internetem.",
      Icon: CloudOff,
    };
  if (status.pendingCount)
    return {
      label: "Oczekuje na wysłanie",
      description: "Lokalne zmiany czekają na synchronizację.",
      Icon: Cloud,
    };
  return {
    label: "Zsynchronizowano",
    description: "Wszystkie lokalne zmiany zostały wysłane.",
    Icon: Check,
  };
}

function formatSyncDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("pl-PL", {
        dateStyle: "short",
        timeStyle: "short",
      });
}
