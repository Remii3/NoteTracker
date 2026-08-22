import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { Chapter } from "../model/types";
import type { ManagedItem, SortMode } from "../model/workspace-types";
import { SortableRow } from "./sortable-row";

type Props = {
  chapter: Chapter;
  completeChapter?: Chapter;
  expanded: boolean;
  chapterId: string;
  topicId: string;
  isHome: boolean;
  isEditing: boolean;
  search: string;
  sortMode: SortMode;
  allChapters: Chapter[];
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
};

export function SidebarChapter(props: Props) {
  const {
    chapter,
    completeChapter,
    expanded,
    chapterId,
    topicId,
    isHome,
    isEditing,
    search,
    sortMode,
    allChapters,
    onSelectChapter,
    onSelectTopic,
    onToggleExpanded,
    onToggleChapter,
    onToggleTopic,
    onRenameItem,
    onDeleteItem,
  } = props;
  const allTopics = completeChapter?.topics ?? chapter.topics;
  const count = allTopics.filter((child) => child.completed).length;
  const completed = allTopics.length > 0 && count === allTopics.length;
  const partial = count > 0 && !completed;

  return (
    <Collapsible
      open={Boolean(search.trim()) || expanded}
      onOpenChange={(open) => onToggleExpanded(chapter.id, open)}
    >
      <SidebarMenuItem>
        <SortableRow
          id={chapter.id}
          active={!isHome && chapter.id === chapterId}
          disabled={
            !isEditing || sortMode !== "manual" || Boolean(search.trim())
          }
          data={{ type: "chapter" }}
          className="gap-0"
        >
          <Checkbox
            checked={completed}
            indeterminate={partial}
            disabled={!allTopics.length}
            aria-label={`Zmień status rozdziału ${chapter.title}`}
            onCheckedChange={(value) => onToggleChapter(chapter.id, value)}
            className="ml-1"
          />
          <SidebarMenuButton
            isActive={!isHome && chapter.id === chapterId}
            onClick={() => onSelectChapter(chapter)}
            className={
              isEditing
                ? "flex-1 pr-7 hover:bg-transparent active:bg-transparent data-active:bg-transparent"
                : "flex-1 hover:bg-transparent active:bg-transparent data-active:bg-transparent"
            }
          >
            <span>{chapter.title}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {count}/{allTopics.length}
            </span>
          </SidebarMenuButton>
          {isEditing && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="absolute right-7"
                    aria-label={`Akcje rozdziału ${chapter.title}`}
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
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
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() =>
                    onDeleteItem({
                      kind: "chapter",
                      id: chapter.id,
                      title: chapter.title,
                      childCount: chapter.topics.length,
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
                aria-label={`Rozwiń rozdział ${chapter.title}`}
              />
            }
          >
            <ChevronRight className="transition-transform [[data-panel-open]_&]:rotate-90" />
          </CollapsibleTrigger>
        </SortableRow>
        <CollapsibleContent>
          <SortableContext
            items={chapter.topics}
            strategy={verticalListSortingStrategy}
          >
            <SidebarMenuSub>
              {chapter.topics.map((child) => (
                <SidebarMenuSubItem key={child.id}>
                  <SortableRow
                    id={child.id}
                    active={!isHome && child.id === topicId}
                    disabled={!isEditing || Boolean(search.trim())}
                    data={{
                      type: "topic",
                      chapterId: chapter.id,
                    }}
                    className="gap-0"
                  >
                    <Checkbox
                      checked={child.completed}
                      aria-label={`Zmień status ${child.title}`}
                      onCheckedChange={(value) =>
                        onToggleTopic(chapter.id, child.id, value)
                      }
                    />
                    <SidebarMenuSubButton
                      isActive={!isHome && child.id === topicId}
                      render={<button type="button" />}
                      onClick={() => onSelectTopic(chapter.id, child.id)}
                      className={
                        isEditing
                          ? "flex-1 pr-7 hover:bg-transparent active:bg-transparent data-active:bg-transparent"
                          : "flex-1 hover:bg-transparent active:bg-transparent data-active:bg-transparent"
                      }
                    >
                      <span>{child.title}</span>
                    </SidebarMenuSubButton>
                    {isEditing && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="absolute right-0"
                              aria-label={`Akcje tematu ${child.title}`}
                            />
                          }
                        >
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
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
              {!chapter.topics.length && (
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
