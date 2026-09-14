import {
  ArrowUpDown,
  BarChart3,
  Images,
  Layers3,
  LibraryBig,
  Search,
  X,
} from "lucide-react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import type {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  useSensors,
} from "@dnd-kit/core";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ManagedItem, SortMode } from "../types/workspace-types";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCallback, useEffect, useRef, useState } from "react";

import { AccountMenu } from "@/features/auth";
import { Button } from "@/components/ui/button";
import type { Chapter } from "../types/model";
import { Input } from "@/components/ui/input";
import { MobileAppSidebarHeader } from "@/components/app-header";
import { SidebarChapter } from "./sidebar-chapter";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  chapters: Chapter[];
  visibleChapters: Chapter[];
  expandedChapters: Set<string>;
  chapterId: string;
  topicId: string;
  isChapters: boolean;
  isGallery: boolean;
  isQuestions: boolean;
  isStatistics: boolean;
  isEditing: boolean;
  search: string;
  sortMode: SortMode;
  error: string | null;
  sensors: ReturnType<typeof useSensors>;
  onSearchChange: (value: string) => void;
  onSortModeChange: (value: SortMode) => void;
  onOpenChapters: () => void;
  onOpenGallery: () => void;
  onOpenQuestions: () => void;
  onOpenStatistics: () => void;
  onOpenAddDialog: () => void;
  onSelectChapter: (chapter: Chapter) => void;
  onSelectTopic: (chapterId: string, topicId: string) => void;
  onToggleExpanded: (chapterId: string, open: boolean) => void;
  onPrefetchTopics: (chapterId: string) => void;
  onToggleChapter: (chapterId: string, completed: boolean) => void;
  onToggleTopic: (
    chapterId: string,
    topicId: string,
    completed: boolean,
  ) => void;
  onRenameItem: (item: ManagedItem) => void;
  onDeleteItem: (item: ManagedItem) => void;
  onMoveChapter?: (chapter: Chapter) => void;
  onDragStart: (event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragCancel: () => void;
  onDragEnd: (event: DragEndEvent) => void;
  userEmail?: string;
  isLoading?: boolean;
  onOpenModules?: () => void;
  userName?: string;
  onSignOut?: () => void;
  onOpenAccount?: () => void;
  isSearching?: boolean;
};

export function WorkspaceSidebar({
  chapters,
  visibleChapters,
  expandedChapters,
  chapterId,
  topicId,
  isChapters,
  isGallery,
  isQuestions,
  isStatistics,
  isEditing,
  search,
  sortMode,
  error,
  sensors,
  onSearchChange,
  onSortModeChange,
  onOpenChapters,
  onOpenGallery,
  onOpenQuestions,
  onOpenStatistics,
  onOpenAddDialog,
  onSelectChapter,
  onSelectTopic,
  onToggleExpanded,
  onPrefetchTopics,
  onToggleChapter,
  onToggleTopic,
  onRenameItem,
  onDeleteItem,
  onMoveChapter,
  onDragStart,
  onDragOver,
  onDragCancel,
  onDragEnd,
  userEmail,
  isLoading,
  onOpenModules,
  userName,
  onSignOut,
  onOpenAccount,
  isSearching,
}: Props) {
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const chapterListRef = useRef<HTMLDivElement>(null);
  const [scrollEdges, setScrollEdges] = useState({
    top: false,
    bottom: false,
  });
  const hasSearch = search.trim().length > 0;
  const isEmpty = chapters.length === 0 && !hasSearch;
  const matchingTopicsCount = visibleChapters.reduce(
    (total, chapter) => total + chapter.topics.length,
    0,
  );
  const closeMobileSidebar = useCallback(() => {
    if (isMobile) setOpenMobile(false);
  }, [isMobile, setOpenMobile]);
  const compactNavigation = [
    {
      label: "Wszystkie rozdziały",
      ariaLabel: "Przejdź do wszystkich rozdziałów",
      icon: LibraryBig,
      active: isChapters,
      onClick: onOpenChapters,
    },
    {
      label: "Statystyki",
      ariaLabel: "Przejdź do statystyk",
      icon: BarChart3,
      active: isStatistics,
      onClick: onOpenStatistics,
    },
    {
      label: "Galeria",
      ariaLabel: "Przejdź do galerii",
      icon: Images,
      active: isGallery,
      onClick: onOpenGallery,
    },
    {
      label: "Baza pytań",
      ariaLabel: "Przejdź do bazy pytań",
      icon: Layers3,
      active: isQuestions,
      onClick: onOpenQuestions,
    },
  ];
  const sortModeLabel = {
    manual: "ręczne",
    az: "alfabetycznie A–Z",
    za: "alfabetycznie Z–A",
    completed: "ukończone najpierw",
    incomplete: "nieukończone najpierw",
  }[sortMode];
  const updateChapterScrollState = useCallback(() => {
    const element = chapterListRef.current;
    if (!element) return;
    const next = {
      top: element.scrollTop > 1,
      bottom:
        element.scrollTop + element.clientHeight < element.scrollHeight - 1,
    };
    setScrollEdges((current) =>
      current.top === next.top && current.bottom === next.bottom
        ? current
        : next,
    );
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateChapterScrollState);
    return () => window.cancelAnimationFrame(frame);
  }, [
    chapters,
    expandedChapters,
    isLoading,
    isSearching,
    search,
    updateChapterScrollState,
    visibleChapters,
  ]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (
        event.key !== "/" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="textbox"]',
        )
      )
        return;
      event.preventDefault();
      if (isMobile) setOpenMobile(true);
      else setOpen(true);
      window.requestAnimationFrame(() => searchInputRef.current?.focus());
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [isMobile, setOpen, setOpenMobile]);

  return (
    <Sidebar
      collapsible="offcanvas"
      className="top-14 h-[calc(100svh-3.5rem)] [&_button]:cursor-default"
    >
      <MobileAppSidebarHeader
        onOpenHome={() => {
          onOpenModules?.();
          closeMobileSidebar();
        }}
      />
      <nav
        aria-label="Widoki modułu"
        className="flex h-10 shrink-0 items-center gap-1 border-b bg-sidebar px-2"
      >
        <span className="mr-auto text-xs font-medium text-sidebar-foreground/70">
          Widoki
        </span>
        {compactNavigation.map(
          ({ label, ariaLabel, icon: Icon, active, onClick }) => (
            <Tooltip key={label}>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={ariaLabel}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "size-10 border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/70 md:size-8"
                        : "size-10 text-sidebar-foreground/75 focus-visible:ring-2 focus-visible:ring-sidebar-ring/70 md:size-8"
                    }
                    onClick={() => {
                      onClick();
                      closeMobileSidebar();
                    }}
                  />
                }
              >
                <Icon />
              </TooltipTrigger>
              <TooltipContent side="bottom">{label}</TooltipContent>
            </Tooltip>
          ),
        )}
      </nav>
      <SidebarHeader className="gap-2 border-b p-2">
        <div className="flex gap-2">
          <div className="group relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={search}
              disabled={isLoading}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                if (search) onSearchChange("");
                else event.currentTarget.blur();
              }}
              aria-keyshortcuts="/"
              placeholder="Szukaj rozdziałów"
              className="pr-8 pl-8"
            />
            {!search && (
              <kbd className="pointer-events-none absolute top-1/2 right-2 hidden h-5 -translate-y-1/2 items-center rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground group-focus-within:hidden md:inline-flex">
                /
              </kbd>
            )}
            {search && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Wyczyść wyszukiwanie"
                className="absolute top-1/2 right-1 -translate-y-1/2 active:not-aria-[haspopup]:-translate-y-1/2!"
                onClick={() => onSearchChange("")}
              >
                <X />
              </Button>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant={sortMode === "manual" ? "outline" : "secondary"}
                  size="icon"
                  className="relative"
                  aria-label={`Sortowanie rozdziałów: ${sortModeLabel}`}
                  disabled={isLoading}
                />
              }
            >
              <ArrowUpDown />
              {sortMode !== "manual" && (
                <span
                  className="absolute top-1 right-1 size-1.5 rounded-full bg-primary"
                  aria-hidden="true"
                />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Sortowanie rozdziałów</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuRadioGroup
                value={sortMode}
                onValueChange={(value) => onSortModeChange(value as SortMode)}
              >
                <DropdownMenuRadioItem value="manual">
                  Ręcznie
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="az">
                  Alfabetycznie A–Z
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="za">
                  Alfabetycznie Z–A
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="completed">
                  Ukończone najpierw
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="incomplete">
                  Nieukończone najpierw
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarHeader>

      <div className="relative flex min-h-0 flex-1">
        <SidebarContent
          ref={chapterListRef}
          className="gap-0"
          onScroll={updateChapterScrollState}
        >
          <nav aria-label="Rozdziały modułu">
            <SidebarGroup>
              <SidebarGroupContent>
                {hasSearch && !isSearching && !isLoading && (
                  <p
                    className="px-2 pb-2 text-xs text-sidebar-foreground/65"
                    aria-live="polite"
                  >
                    {formatResultCount(visibleChapters.length, "rozdział")} ·{" "}
                    {formatResultCount(matchingTopicsCount, "temat")}
                  </p>
                )}
                {error && (
                  <p
                    role="alert"
                    className="mb-2 px-2 text-xs text-destructive"
                  >
                    {error}
                  </p>
                )}
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={onDragStart}
                  onDragOver={onDragOver}
                  onDragCancel={onDragCancel}
                  onDragEnd={onDragEnd}
                >
                  <SortableContext
                    items={visibleChapters}
                    strategy={verticalListSortingStrategy}
                  >
                    <SidebarMenu>
                      {!visibleChapters.length &&
                        !isSearching &&
                        !isLoading && (
                          <li className="px-3 py-8 text-center">
                            {isEmpty ? (
                              <>
                                <p className="text-sm font-medium">
                                  Nie masz jeszcze rozdziałów
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Dodaj pierwszy rozdział, aby zacząć tworzyć
                                  notatki.
                                </p>
                                {isEditing && (
                                  <Button
                                    type="button"
                                    variant="link"
                                    size="sm"
                                    className="mt-2"
                                    onClick={onOpenAddDialog}
                                  >
                                    Dodaj pierwszy rozdział
                                  </Button>
                                )}
                              </>
                            ) : (
                              <>
                                <p className="text-sm font-medium">
                                  Brak wyników
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Nie znaleziono rozdziału ani tematu pasującego
                                  do „{search.trim()}”.
                                </p>
                                <Button
                                  type="button"
                                  variant="link"
                                  size="sm"
                                  className="mt-2"
                                  onClick={() => onSearchChange("")}
                                >
                                  Wyczyść wyszukiwanie
                                </Button>
                              </>
                            )}
                          </li>
                        )}
                      {!isSearching &&
                        !isLoading &&
                        visibleChapters.map((chapter) => (
                          <SidebarChapter
                            key={chapter.id}
                            chapter={chapter}
                            completeChapter={chapters.find(
                              (item) => item.id === chapter.id,
                            )}
                            expanded={expandedChapters.has(chapter.id)}
                            chapterId={chapterId}
                            topicId={topicId}
                            isEditing={isEditing}
                            search={search}
                            sortMode={sortMode}
                            allChapters={chapters}
                            onSelectChapter={(chapter) => {
                              onSelectChapter(chapter);
                              closeMobileSidebar();
                            }}
                            onSelectTopic={(nextChapterId, nextTopicId) => {
                              onSelectTopic(nextChapterId, nextTopicId);
                              closeMobileSidebar();
                            }}
                            onToggleExpanded={onToggleExpanded}
                            onPrefetchTopics={onPrefetchTopics}
                            onToggleChapter={onToggleChapter}
                            onToggleTopic={onToggleTopic}
                            onRenameItem={onRenameItem}
                            onDeleteItem={onDeleteItem}
                            onMoveChapter={onMoveChapter}
                          />
                        ))}
                      {isSearching && (
                        <li
                          className="space-y-2 px-1 py-1"
                          aria-label="Wyszukiwanie rozdziałów"
                        >
                          {Array.from({ length: 4 }, (_, index) => (
                            <div
                              key={index}
                              className="flex h-8 items-center gap-2 px-2"
                            >
                              <Skeleton className="size-4 shrink-0 rounded-sm" />
                              <Skeleton
                                className={
                                  index % 2 === 0 ? "h-3 w-32" : "h-3 w-24"
                                }
                              />
                              <Skeleton className="ml-auto h-3 w-7" />
                            </div>
                          ))}
                        </li>
                      )}
                      {isLoading && <SidebarChaptersSkeleton />}
                    </SidebarMenu>
                  </SortableContext>
                </DndContext>
              </SidebarGroupContent>
            </SidebarGroup>
          </nav>
        </SidebarContent>
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-5 bg-linear-to-b from-sidebar via-sidebar/80 to-transparent transition-opacity motion-reduce:transition-none ${scrollEdges.top ? "opacity-100" : "opacity-0"}`}
        />
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 h-5 bg-linear-to-t from-sidebar via-sidebar/80 to-transparent transition-opacity motion-reduce:transition-none ${scrollEdges.bottom ? "opacity-100" : "opacity-0"}`}
        />
      </div>

      <SidebarFooter className="min-h-16 shrink-0 justify-center border-t p-2">
        <AccountMenu
          userName={userName}
          userEmail={userEmail}
          onOpenAccount={() => onOpenAccount?.()}
          onSignOut={() => onSignOut?.()}
        />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

function SidebarChaptersSkeleton() {
  return (
    <li
      className="space-y-2 px-1 py-1"
      role="status"
      aria-busy="true"
      aria-label="Ładowanie rozdziałów"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="flex h-8 items-center gap-2 px-2"
          aria-hidden="true"
        >
          <Skeleton className="size-4 shrink-0 rounded-sm" />
          <Skeleton className={index % 3 === 0 ? "h-3 w-36" : "h-3 w-28"} />
          <Skeleton className="ml-auto h-3 w-7" />
        </div>
      ))}
    </li>
  );
}

function formatResultCount(count: number, noun: "rozdział" | "temat") {
  const lastTwo = count % 100;
  const last = count % 10;
  const form =
    count === 1
      ? noun
      : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
        ? noun === "rozdział"
          ? "rozdziały"
          : "tematy"
        : noun === "rozdział"
          ? "rozdziałów"
          : "tematów";
  return `${count} ${form}`;
}
