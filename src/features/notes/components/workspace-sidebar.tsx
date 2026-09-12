import {
  ArrowUpDown,
  BarChart3,
  BookOpen,
  Images,
  Layers3,
  LibraryBig,
  LogOut,
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Chapter } from "../types/model";
import { Input } from "@/components/ui/input";
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
  moduleName?: string;
  moduleNameLoading?: boolean;
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
  moduleName,
  moduleNameLoading,
  isLoading,
  onOpenModules,
  userName,
  onSignOut,
  onOpenAccount,
  isSearching,
}: Props) {
  const hasSearch = search.trim().length > 0;
  const isEmpty = chapters.length === 0 && !hasSearch;
  const navigationSentinelRef = useRef<HTMLDivElement>(null);
  const [primaryNavigationVisible, setPrimaryNavigationVisible] =
    useState(true);

  useEffect(() => {
    const sentinel = navigationSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setPrimaryNavigationVisible(entry.isIntersecting),
      { threshold: 0.01 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="border-b p-3">
        <div className="flex items-center gap-3 px-1 py-1">
          <Button
            onClick={onOpenChapters}
            className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"
          >
            <BookOpen className="size-5" />
          </Button>
          <div>
            <button type="button" className="text-left" onClick={onOpenModules}>
              {moduleNameLoading ? (
                <Skeleton className="h-4 w-28" />
              ) : (
                <p className="font-semibold leading-tight">
                  {moduleName ?? "NoteTracker"}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Zmień moduł</p>
            </button>
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              disabled={isLoading}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Szukaj rozdziałów"
              className="pr-8 pl-8"
            />
            {search && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Wyczyść wyszukiwanie"
                className="absolute top-1/2 right-1 -translate-y-1/2"
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
                  aria-label="Sortuj rozdziały"
                  disabled={isLoading}
                />
              }
            >
              <ArrowUpDown />
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

      <SidebarContent>
        <SidebarGroup className="pb-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={isChapters} onClick={onOpenChapters}>
                <LibraryBig />
                <span>Wszystkie rozdziały</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={isStatistics}
                onClick={onOpenStatistics}
              >
                <BarChart3 />
                <span>Statystyki</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={isGallery} onClick={onOpenGallery}>
                <Images />
                <span>Galeria</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={isQuestions}
                onClick={onOpenQuestions}
              >
                <Layers3 />
                <span>Baza pytań</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div ref={navigationSentinelRef} className="h-px" aria-hidden />
        </SidebarGroup>
        <SidebarGroup>
          <div className="sticky top-0 z-20 -mx-2 bg-sidebar/95 px-2 py-1 backdrop-blur-sm">
            <div className="flex h-8 items-center gap-1 px-2">
              <span className="mr-auto text-xs font-medium text-sidebar-foreground/70">
                Rozdziały
              </span>
              {!primaryNavigationVisible && (
                <>
                  <Button
                    type="button"
                    variant={isStatistics ? "secondary" : "ghost"}
                    size="icon-xs"
                    title="Statystyki"
                    aria-label="Przejdź do statystyk"
                    onClick={onOpenStatistics}
                  >
                    <BarChart3 />
                  </Button>
                  <Button
                    type="button"
                    variant={isGallery ? "secondary" : "ghost"}
                    size="icon-xs"
                    title="Galeria"
                    aria-label="Przejdź do galerii"
                    onClick={onOpenGallery}
                  >
                    <Images />
                  </Button>
                  <Button
                    type="button"
                    variant={isChapters ? "secondary" : "ghost"}
                    size="icon-xs"
                    title="Wszystkie rozdziały"
                    aria-label="Przejdź do wszystkich rozdziałów"
                    onClick={onOpenChapters}
                  >
                    <LibraryBig />
                  </Button>
                  <Button
                    type="button"
                    variant={isQuestions ? "secondary" : "ghost"}
                    size="icon-xs"
                    title="Baza pytań"
                    aria-label="Przejdź do bazy pytań"
                    onClick={onOpenQuestions}
                  >
                    <Layers3 />
                  </Button>
                </>
              )}
            </div>
          </div>
          <SidebarGroupContent>
            {error && (
              <p role="alert" className="mb-2 px-2 text-xs text-destructive">
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
                  {!visibleChapters.length && !isSearching && !isLoading && (
                    <li className="px-3 py-8 text-center">
                      {isEmpty ? (
                        <>
                          <p className="text-sm font-medium">
                            Nie masz jeszcze rozdziałów
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Dodaj pierwszy rozdział, aby zacząć tworzyć notatki.
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
                          <p className="text-sm font-medium">Brak wyników</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Nie znaleziono rozdziału ani tematu pasującego do „
                            {search.trim()}”.
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
                        onSelectChapter={onSelectChapter}
                        onSelectTopic={onSelectTopic}
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
      </SidebarContent>

      <SidebarFooter className="min-h-16 shrink-0 justify-center border-t p-2">
        <div className="flex w-full items-center gap-1">
          <Button
            variant="ghost"
            type="button"
            className="h-auto min-w-0 flex-1 justify-start gap-3 px-2 py-1.5 text-left"
            onClick={onOpenAccount}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
              {(userName?.[0] ?? userEmail?.[0] ?? "U").toLocaleUpperCase("pl")}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium leading-5">
                {userName ?? "Użytkownik"}
              </span>
              <span className="block truncate text-xs font-normal leading-4 text-muted-foreground">
                {userEmail ?? "konto prywatne"}
              </span>
            </span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            type="button"
            aria-label="Wyloguj"
            onClick={onSignOut}
          >
            <LogOut />
          </Button>
        </div>
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
