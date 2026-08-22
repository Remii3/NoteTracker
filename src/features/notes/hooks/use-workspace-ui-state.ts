import { useCallback, useState } from "react";

import type { ManagedItem, SortMode } from "../model/workspace-types";

type Options = {
  initialChapterId?: string;
  firstChapterId?: string;
};

export function useWorkspaceUiState({
  initialChapterId,
  firstChapterId,
}: Options) {
  const [isEditing, setIsEditing] = useState(false);
  const [expandedChapters, setExpandedChapters] = useState(
    () =>
      new Set(
        [firstChapterId, initialChapterId].filter((id): id is string =>
          Boolean(id),
        ),
      ),
  );
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [renameItem, setRenameItem] = useState<ManagedItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<ManagedItem | null>(null);
  const [sidebarError, setSidebarError] = useState<string | null>(null);
  const [previewPending, setPreviewPending] = useState(false);

  const expandChapter = useCallback((chapterId: string) => {
    setExpandedChapters((current) => new Set(current).add(chapterId));
  }, []);

  const toggleExpanded = useCallback((chapterId: string, open: boolean) => {
    setExpandedChapters((current) => {
      const next = new Set(current);
      if (open) next.add(chapterId);
      else next.delete(chapterId);
      return next;
    });
  }, []);

  const closeEditingUi = useCallback(() => {
    setAddDialogOpen(false);
    setRenameItem(null);
    setDeleteItem(null);
    setSidebarError(null);
  }, []);

  return {
    addDialogOpen,
    closeEditingUi,
    deleteItem,
    expandChapter,
    expandedChapters,
    isEditing,
    previewPending,
    renameItem,
    search,
    setAddDialogOpen,
    setDeleteItem,
    setIsEditing,
    setPreviewPending,
    setRenameItem,
    setSearch,
    setSidebarError,
    setSortMode,
    sidebarError,
    sortMode,
    toggleExpanded,
  };
}
