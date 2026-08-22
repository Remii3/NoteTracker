import type {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  useSensors,
} from "@dnd-kit/core";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  ArrowUpDown,
  BookOpen,
  Home,
  LogOut,
  Plus,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { SidebarChapter } from "./sidebar-chapter";
import type { Chapter } from "../model/types";
import type { ManagedItem, SortMode } from "../model/workspace-types";

type Props = {
  chapters: Chapter[];
  visibleChapters: Chapter[];
  expandedChapters: Set<string>;
  chapterId: string;
  topicId: string;
  isHome: boolean;
  isEditing: boolean;
  search: string;
  sortMode: SortMode;
  error: string | null;
  sensors: ReturnType<typeof useSensors>;
  onSearchChange: (value: string) => void;
  onSortModeChange: (value: SortMode) => void;
  onOpenHome: () => void;
  onOpenAddDialog: () => void;
  onSelectChapter: (chapter: Chapter) => void;
  onSelectTopic: (chapterId: string, topicId: string) => void;
  onToggleExpanded: (chapterId: string, open: boolean) => void;
  onToggleChapter: (chapterId: string, completed: boolean) => void;
  onToggleTopic: (
    chapterId: string,
    topicId: string,
    completed: boolean,
  ) => void;
  onRenameItem: (item: ManagedItem) => void;
  onDeleteItem: (item: ManagedItem) => void;
  onDragStart: (event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragCancel: () => void;
  onDragEnd: (event: DragEndEvent) => void;
};

export function WorkspaceSidebar({
  chapters,
  visibleChapters,
  expandedChapters,
  chapterId,
  topicId,
  isHome,
  isEditing,
  search,
  sortMode,
  error,
  sensors,
  onSearchChange,
  onSortModeChange,
  onOpenHome,
  onOpenAddDialog,
  onSelectChapter,
  onSelectTopic,
  onToggleExpanded,
  onToggleChapter,
  onToggleTopic,
  onRenameItem,
  onDeleteItem,
  onDragStart,
  onDragOver,
  onDragCancel,
  onDragEnd,
}: Props) {
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="border-b p-3">
        <div className="flex items-center gap-3 px-1 py-1">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <BookOpen className="size-5" />
          </span>
          <div>
            <p className="font-semibold leading-tight">NoteTracker</p>
            <p className="text-xs text-muted-foreground">
              Twoja przestrzeń nauki
            </p>
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
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
              <SidebarMenuButton isActive={isHome} onClick={onOpenHome}>
                <Home />
                <span>Strona główna</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Rozdziały</SidebarGroupLabel>
          {isEditing && (
            <SidebarGroupAction
              aria-label="Dodaj rozdział lub tematy"
              onClick={onOpenAddDialog}
            >
              <Plus />
            </SidebarGroupAction>
          )}
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
                  {!visibleChapters.length && (
                    <li className="px-3 py-8 text-center">
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
                    </li>
                  )}
                  {visibleChapters.map((chapter) => (
                    <SidebarChapter
                      key={chapter.id}
                      chapter={chapter}
                      completeChapter={chapters.find(
                        (item) => item.id === chapter.id,
                      )}
                      expanded={expandedChapters.has(chapter.id)}
                      chapterId={chapterId}
                      topicId={topicId}
                      isHome={isHome}
                      isEditing={isEditing}
                      search={search}
                      sortMode={sortMode}
                      allChapters={chapters}
                      onSelectChapter={onSelectChapter}
                      onSelectTopic={onSelectTopic}
                      onToggleExpanded={onToggleExpanded}
                      onToggleChapter={onToggleChapter}
                      onToggleTopic={onToggleTopic}
                      onRenameItem={onRenameItem}
                      onDeleteItem={onDeleteItem}
                    />
                  ))}
                </SidebarMenu>
              </SortableContext>
            </DndContext>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="h-16 shrink-0 justify-center border-t p-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-secondary text-sm font-semibold">
            RK
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">Remi</p>
            <p className="truncate text-xs text-muted-foreground">
              konto prywatne
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Wyloguj">
            <LogOut />
          </Button>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
