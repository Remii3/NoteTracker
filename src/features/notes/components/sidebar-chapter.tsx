import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  ChevronRight,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import type { Chapter } from "../types/model";
import type { ManagedItem, SortMode } from "../types/workspace-types";
import { SortableRow } from "./sortable-row";

type Props = {
  chapter: Chapter;
  completeChapter?: Chapter;
  expanded: boolean;
  chapterId: string;
  topicId: string;
  isEditing: boolean;
  search: string;
  sortMode: SortMode;
  allChapters: Chapter[];
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
};

export function SidebarChapter(props: Props) {
  const {
    chapter,
    completeChapter,
    expanded,
    chapterId,
    topicId,
    isEditing,
    search,
    sortMode,
    allChapters,
    onSelectChapter,
    onSelectTopic,
    onToggleExpanded,
    onPrefetchTopics,
    onToggleChapter,
    onToggleTopic,
    onRenameItem,
    onDeleteItem,
    onMoveChapter,
  } = props;
  const isSearch = Boolean(search.trim());
  const allTopics = isSearch
    ? chapter.topics
    : (completeChapter?.topics ?? chapter.topics);
  const count = isSearch
    ? allTopics.filter((child) => child.completed).length
    : (completeChapter?.completedTopicsCount ?? chapter.completedTopicsCount);
  const total = isSearch
    ? allTopics.length
    : (completeChapter?.topicsCount ?? chapter.topicsCount);
  const completed = total > 0 && count === total;
  const partial = count > 0 && !completed;
  const isChapterActive = chapter.id === chapterId && !topicId;
  const canDragChapter = isEditing && sortMode === "manual" && !isSearch;

  return (
    <Collapsible
      open={Boolean(search.trim()) || expanded}
      onOpenChange={(open) => onToggleExpanded(chapter.id, open)}
    >
      <SidebarMenuItem onPointerEnter={() => onPrefetchTopics(chapter.id)}>
        <SortableRow
          id={chapter.id}
          active={isChapterActive}
          disabled={!canDragChapter}
          data={{ type: "chapter" }}
        >
          <Checkbox
            checked={completed}
            indeterminate={partial}
            disabled={!total}
            aria-label={`Zmień status rozdziału ${chapter.title}`}
            onCheckedChange={(value) => onToggleChapter(chapter.id, value)}
          />
          <SidebarMenuButton
            isActive={isChapterActive}
            aria-current={isChapterActive ? "page" : undefined}
            onClick={() => onSelectChapter(chapter)}
            className="h-8 min-w-0 flex-1 px-0 before:hidden hover:bg-transparent active:bg-transparent data-active:bg-transparent"
          >
            <OverflowTooltipLabel>{chapter.title}</OverflowTooltipLabel>
            <span className="shrink-0 text-xs text-muted-foreground">
              {count}/{total}
            </span>
          </SidebarMenuButton>
          {isEditing && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-9 md:size-6"
                    aria-label={`Akcje rozdziału ${chapter.title}`}
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem
                  className="whitespace-nowrap"
                  onClick={() =>
                    onRenameItem({
                      kind: "chapter",
                      id: chapter.id,
                      title: chapter.title,
                      unavailableTitles: allChapters
                        .filter((chapter) => chapter.id !== chapter.id)
                        .map((chapter) => chapter.title),
                    })
                  }
                >
                  <Pencil /> Zmień nazwę
                </DropdownMenuItem>
                {onMoveChapter && (
                  <DropdownMenuItem onClick={() => onMoveChapter(chapter)}>
                    <FolderInput /> Przenieś do modułu
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="whitespace-nowrap"
                  variant="destructive"
                  onClick={() =>
                    onDeleteItem({
                      kind: "chapter",
                      id: chapter.id,
                      title: chapter.title,
                      childCount: chapter.topicsCount,
                    })
                  }
                >
                  <Trash2 /> Usuń
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <CollapsibleTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-9 md:size-6"
                aria-label={`${expanded ? "Zwiń" : "Rozwiń"} rozdział ${chapter.title}`}
              />
            }
          >
            <ChevronRight className="transition-transform motion-reduce:transition-none [[data-panel-open]_&]:rotate-90" />
          </CollapsibleTrigger>
        </SortableRow>
        <CollapsibleContent>
          <SortableContext
            items={chapter.topics}
            strategy={verticalListSortingStrategy}
          >
            <SidebarMenuSub
              className={canDragChapter ? "ml-[3.75rem] md:ml-12" : undefined}
            >
              {chapter.topicsStatus === "loading" && !isSearch && (
                <li
                  className="space-y-2 px-2 py-2"
                  aria-label="Pobieranie tematów"
                >
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-3/5" />
                  <Skeleton className="h-3 w-2/3" />
                </li>
              )}
              {chapter.topics.map((child) => (
                <SidebarMenuSubItem key={child.id}>
                  <SortableRow
                    id={child.id}
                    active={child.id === topicId}
                    disabled={!isEditing || Boolean(search.trim())}
                    data={{
                      type: "topic",
                      chapterId: chapter.id,
                    }}
                  >
                    <Checkbox
                      checked={child.completed}
                      aria-label={`Zmień status ${child.title}`}
                      onCheckedChange={(value) =>
                        onToggleTopic(chapter.id, child.id, value)
                      }
                    />
                    <SidebarMenuSubButton
                      isActive={child.id === topicId}
                      aria-current={child.id === topicId ? "page" : undefined}
                      render={<button type="button" />}
                      onClick={() => onSelectTopic(chapter.id, child.id)}
                      className="h-8 min-w-0 flex-1 px-0 hover:bg-transparent active:bg-transparent data-active:bg-transparent"
                    >
                      <OverflowTooltipLabel>{child.title}</OverflowTooltipLabel>
                    </SidebarMenuSubButton>
                    {isEditing && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="size-9 md:size-6"
                              aria-label={`Akcje tematu ${child.title}`}
                            />
                          }
                        >
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-44">
                          <DropdownMenuItem
                            className="whitespace-nowrap"
                            onClick={() =>
                              onRenameItem({
                                kind: "topic",
                                id: child.id,
                                title: child.title,
                                chapterId: chapter.id,
                                unavailableTitles: chapter.topics
                                  .filter((topic) => topic.id !== child.id)
                                  .map((topic) => topic.title),
                              })
                            }
                          >
                            <Pencil /> Zmień nazwę
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="whitespace-nowrap"
                            variant="destructive"
                            onClick={() =>
                              onDeleteItem({
                                kind: "topic",
                                id: child.id,
                                title: child.title,
                                chapterId: chapter.id,
                              })
                            }
                          >
                            <Trash2 /> Usuń
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </SortableRow>
                </SidebarMenuSubItem>
              ))}
              {!chapter.topics.length && chapter.topicsStatus !== "loading" && (
                <li className="px-2 py-2 text-xs text-muted-foreground">
                  {search.trim()
                    ? "Brak pasujących tematów."
                    : "Brak tematów w tym rozdziale."}
                </li>
              )}
            </SidebarMenuSub>
          </SortableContext>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function OverflowTooltipLabel({ children }: { children: ReactNode }) {
  const labelRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const element = labelRef.current;
    if (!element) return;
    const update = () =>
      setIsOverflowing(element.scrollWidth > element.clientWidth + 1);
    const frame = window.requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [children]);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span ref={labelRef} className="min-w-0 flex-1 truncate text-left" />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="right" hidden={!isOverflowing}>
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
