import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceActions } from "../hooks/use-workspace-actions";
import { useNoteDrafts } from "../hooks/use-note-drafts";
import { useNotesStore } from "../hooks/use-notes-store";
import { useRichTextModule } from "../hooks/use-rich-text-module";
import { useWorkspaceDnd } from "../hooks/use-workspace-dnd";
import { useWorkspaceRoute } from "../hooks/use-workspace-route";
import { useWorkspaceUiState } from "../hooks/use-workspace-ui-state";
import { selectVisibleChapters } from "../lib/chapter-selectors";
import type { Chapter } from "../types/model";
import type { NotesRepository } from "../data/notes-repository";
import type { TopicImagesService } from "../data/topic-images-service";
import type { QuestionsRepository } from "@/features/questions/data/questions-repository";
import type { ModulesRepository } from "@/features/modules/data/modules-repository";
import type { StatisticsRepository } from "@/features/statistics/data/statistics-repository";
import { ModuleContext, type ModuleContextValue } from "./module-context";
import { ModuleLayout } from "./module-layout";
import type { WorkspaceDialogsProps } from "./workspace-dialogs";
type Props = {
  moduleId: string;
  draftScope?: string;
  repository?: NotesRepository;
  imagesService?: TopicImagesService;
  questionsRepository?: QuestionsRepository;
  modulesRepository?: ModulesRepository;
  statisticsRepository?: StatisticsRepository;
  statisticsCacheScope?: string;
  initialChapters?: Chapter[];
  loadOnMount?: boolean;
  userName?: string;
  userEmail?: string;
  moduleName?: string;
  moduleNameLoading?: boolean;
  onOpenModules?: () => void;
  onSignOut?: () => void;
  onOpenAccount?: () => void;
};

export function ModuleProvider({
  moduleId,
  draftScope,
  repository,
  imagesService,
  questionsRepository,
  modulesRepository,
  statisticsRepository,
  statisticsCacheScope,
  initialChapters,
  loadOnMount,
  userName,
  userEmail,
  moduleName,
  moduleNameLoading,
  onOpenModules,
  onSignOut,
  onOpenAccount,
}: Props) {
  const [isSearchPending, setIsSearchPending] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [movedChapter, setMovedChapter] = useState<Chapter | null>(null);
  const notesStore = useNotesStore({
    repository,
    initialChapters,
    loadOnMount,
    cacheKey: draftScope ? `notes:${draftScope}` : undefined,
  });
  const {
    chapters,
    clearError: clearNotesError,
    error: notesError,
  } = notesStore;
  const {
    loadChapterTopics,
    loadTopicContent,
    loadTopicNavigation,
    searchChapters,
    searchResults,
  } = notesStore;
  const [signOutPending, setSignOutPending] = useState(false);
  const {
    acknowledgeSave,
    clearDraft,
    clearAllDrafts,
    flushDrafts,
    getBaseContent: getDraftBase,
    storageError,
    getContent: getDraftContent,
    reconcileDraft,
    hasDirtyDrafts,
    isTopicDirty,
    updateDraft,
  } = useNoteDrafts(draftScope);
  const {
    activeView,
    chapter,
    chapterId,
    editorDirty,
    navigateHome,
    navigateChapters,
    navigateGallery,
    navigateQuestions,
    navigateStatistics,
    navigateQuestionHistory,
    navigateStudySession,
    navigateToChapter,
    navigationBlocker,
    topic,
    topicId,
    isQuestionHistory,
    showHeader,
  } = useWorkspaceRoute({
    chapters,
    isTopicDirty,
    isLoading: notesStore.isLoading,
    loadFailed: notesStore.loadFailed,
    resolveChapterTopics: loadChapterTopics,
  });
  const { richTextModule, preloadRichTextEditor } = useRichTextModule(
    activeView === "notes",
  );
  const {
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
  } = useWorkspaceUiState({
    firstChapterId: chapters[0]?.id,
    initialChapterId: chapterId,
  });
  const {
    sensors,
    handleDragCancel: handleSidebarDragCancel,
    handleDragEnd: handleSidebarDragEnd,
    handleDragOver: handleSidebarDragOver,
    handleDragStart: handleSidebarDragStart,
  } = useWorkspaceDnd({
    chapters,
    chapterId,
    topicId,
    isEditing,
    isSaving: notesStore.isSaving,
    sortMode,
    previewChapters: notesStore.previewChapters,
    restoreChapters: notesStore.restoreChapters,
    commitDrag: notesStore.commitDrag,
    expandChapter,
    setError: setSidebarError,
    navigateToChapter,
    loadChapterTopics,
  });
  const {
    addChapters,
    addTopics,
    deleteItem: deleteManagedItem,
    deleteItems: deleteManagedItems,
    renameItem: renameManagedItem,
    saveContent,
    toggleChapter,
    toggleTopic,
  } = useWorkspaceActions({
    chapters,
    chapterId,
    topicId,
    topic,
    isEditing,
    isSaving: notesStore.isSaving,
    editorDirty,
    commands: notesStore,
    expandChapter,
    clearDraft,
    acknowledgeSave,
    getDraftContent,
    getDraftBase,
    navigateToChapter,
    navigateHome,
  });
  useEffect(() => {
    if (!hasDirtyDrafts) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      flushDrafts();
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [flushDrafts, hasDirtyDrafts]);

  useEffect(() => {
    if (!notesError) return;
    toast.error(notesError);
    clearNotesError();
  }, [clearNotesError, notesError]);

  function changeSearch(value: string) {
    setSearch(value);
    setIsSearchPending(Boolean(value.trim()));
  }

  useEffect(() => {
    if (!search.trim()) {
      void searchChapters("");
      return;
    }
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void searchChapters(search).finally(() => {
        if (!cancelled) setIsSearchPending(false);
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [search, searchChapters]);
  const visibleChapters = useMemo(
    () =>
      selectVisibleChapters(
        search.trim() ? (searchResults ?? []) : chapters,
        search,
        sortMode,
      ),
    [chapters, search, searchResults, sortMode],
  );
  const orderedChapters = useMemo(
    () => selectVisibleChapters(chapters, "", sortMode),
    [chapters, sortMode],
  );

  async function selectChapter(item: Chapter) {
    const topics = await loadChapterTopics(item.id);
    requestTopicSelection(
      item.id,
      item.firstIncompleteTopicId ?? topics?.[0]?.id ?? "",
    );
    expandChapter(item.id);
  }

  function requestTopicSelection(nextChapterId: string, nextTopicId: string) {
    if (nextChapterId === chapterId && nextTopicId === topicId) return;
    navigateToChapter(nextChapterId, nextTopicId);
  }

  function discardDraftAndContinueNavigation() {
    if (topic) clearDraft(topic.id);
    if (navigationBlocker.state === "blocked") navigationBlocker.proceed();
  }

  async function saveDraftAndContinueNavigation() {
    const saved = await saveContent();
    if (saved && navigationBlocker.state === "blocked") {
      navigationBlocker.proceed();
    }
    return saved;
  }

  function discardDraftAndOpenPreview() {
    if (topic) clearDraft(topic.id);
    setPreviewPending(false);
    setIsEditing(false);
  }

  function openChapters() {
    if (activeView === "chapters") return;
    navigateChapters();
  }

  function openQuestions() {
    navigateQuestions();
  }

  function openGallery() {
    if (activeView === "gallery") return;
    navigateGallery();
  }

  function openStatistics() {
    if (activeView === "statistics") return;
    navigateStatistics();
  }

  async function openChapter(nextChapterId: string, nextTopicId: string) {
    await loadChapterTopics(nextChapterId);
    navigateToChapter(nextChapterId, nextTopicId);
    expandChapter(nextChapterId);
  }

  function changeEditingMode(nextIsEditing: boolean) {
    if (!nextIsEditing && editorDirty) {
      setPreviewPending(true);
      return;
    }
    if (!nextIsEditing) setBulkDeleteOpen(false);
    setIsEditing(nextIsEditing);
    closeEditingUi();
  }

  const contextValue: ModuleContextValue = {
    moduleId,
    chapters,
    orderedChapters,
    learningSummary: notesStore.learningSummary,
    userName,
    moduleName,
    sortMode,
    imagesService,
    questionsRepository,
    statisticsRepository,
    statisticsCacheScope,
    loadChapterTopics,
    openChapter,
    openChapters,
    navigateHome,
    navigateQuestions,
    navigateQuestionHistory,
    navigateStudySession,
    chapterWorkspaceProps: {
      chapter,
      topic,
      chapterId,
      chapters: orderedChapters,
      contentErrors: notesStore.contentErrors,
      editorDirty,
      imagesService,
      isEditing,
      isSaving: notesStore.isSaving,
      questionsRepository,
      richTextModule,
      storageError,
      topicNavigation: notesStore.topicNavigation,
      expandChapter,
      getDraftContent,
      loadChapterTopics,
      loadTopicContent,
      loadTopicNavigation,
      navigateHome,
      navigateToChapter,
      onAddContent: () => setAddDialogOpen(true),
      onContinueEditing: () => changeEditingMode(true),
      onSaveContent: saveContent,
      onToggleTopic: toggleTopic,
      reconcileDraft,
      updateDraft,
    },
  };

  const sidebar = {
    chapters,
    visibleChapters,
    expandedChapters,
    chapterId,
    topicId,
    isChapters: activeView === "chapters",
    isGallery: activeView === "gallery",
    isQuestions: activeView === "questions",
    isStatistics: activeView === "statistics",
    isEditing,
    search,
    sortMode,
    error: sidebarError,
    sensors,
    onSearchChange: changeSearch,
    onSortModeChange: setSortMode,
    onOpenChapters: openChapters,
    onOpenGallery: openGallery,
    onOpenQuestions: openQuestions,
    onOpenStatistics: openStatistics,
    onOpenAddDialog: () => setAddDialogOpen(true),
    onSelectChapter: selectChapter,
    onSelectTopic: requestTopicSelection,
    onToggleExpanded: (nextChapterId: string, open: boolean) => {
      toggleExpanded(nextChapterId, open);
      if (open) void loadChapterTopics(nextChapterId, { prefetch: true });
    },
    onPrefetchTopics: (nextChapterId: string) =>
      void loadChapterTopics(nextChapterId, { prefetch: true }),
    onToggleChapter: toggleChapter,
    onToggleTopic: toggleTopic,
    onRenameItem: setRenameItem,
    onDeleteItem: setDeleteItem,
    onMoveChapter: modulesRepository ? setMovedChapter : undefined,
    onDragStart: handleSidebarDragStart,
    onDragOver: handleSidebarDragOver,
    onDragCancel: handleSidebarDragCancel,
    onDragEnd: handleSidebarDragEnd,
    userEmail,
    moduleName,
    moduleNameLoading,
    isLoading: notesStore.isLoading,
    onOpenModules,
    userName,
    onSignOut: () => {
      if (notesStore.isSaving) {
        toast.info("Poczekaj na zakończenie zapisywania.");
        return;
      }
      if (hasDirtyDrafts) setSignOutPending(true);
      else onSignOut?.();
    },
    onOpenAccount,
    isSearching: isSearchPending || notesStore.isSearching,
  };

  const header = !showHeader
    ? null
    : {
        isChapters: activeView === "chapters",
        isGallery: activeView === "gallery",
        isQuestions: activeView === "questions",
        isQuestionHistory,
        chapterTitle: chapter?.title,
        topicTitle: topic?.title,
        isEditing,
        onChangeEditingMode: changeEditingMode,
        onPreloadEditor: preloadRichTextEditor,
        onOpenAddDialog: () => setAddDialogOpen(true),
        onOpenBulkDelete: () => setBulkDeleteOpen(true),
      };

  const dialogs: WorkspaceDialogsProps = {
    add:
      isEditing && addDialogOpen
        ? {
            open: true,
            chapters: orderedChapters,
            activeChapterId: chapterId,
            onOpenChange: setAddDialogOpen,
            onAddChapters: addChapters,
            onAddTopics: addTopics,
          }
        : null,
    rename:
      isEditing && renameItem
        ? {
            item: renameItem,
            onClose: () => setRenameItem(null),
            onRename: (title: string) => renameManagedItem(renameItem, title),
          }
        : null,
    deleteItem:
      isEditing && deleteItem
        ? {
            item: deleteItem,
            onClose: () => setDeleteItem(null),
            onDelete: () => deleteManagedItem(deleteItem),
          }
        : null,
    bulkDelete:
      isEditing && bulkDeleteOpen
        ? {
            chapters: orderedChapters,
            onClose: () => setBulkDeleteOpen(false),
            onLoadTopics: loadChapterTopics,
            onDelete: deleteManagedItems,
          }
        : null,
    navigation:
      navigationBlocker.state === "blocked"
        ? {
            onCancel: navigationBlocker.reset,
            onDiscard: discardDraftAndContinueNavigation,
            onSave: saveDraftAndContinueNavigation,
          }
        : null,
    signOut: signOutPending
      ? {
          description: "Wylogowanie odrzuci niezapisane zmiany w notatkach.",
          discardLabel: "Odrzuć i wyloguj",
          onCancel: () => setSignOutPending(false),
          onDiscard: () => {
            setSignOutPending(false);
            clearAllDrafts();
            onSignOut?.();
          },
        }
      : null,
    preview: previewPending
      ? {
          description:
            "Przejście do trybu podglądu odrzuci niezapisane zmiany w treści tej notatki.",
          discardLabel: "Odrzuć i włącz podgląd",
          onCancel: () => setPreviewPending(false),
          onDiscard: discardDraftAndOpenPreview,
        }
      : null,
    moveChapter:
      movedChapter && modulesRepository
        ? {
            chapter: movedChapter,
            currentModuleId: moduleId,
            repository: modulesRepository,
            onClose: () => setMovedChapter(null),
            onMoved: async () => {
              navigateHome();
              await notesStore.load();
            },
          }
        : null,
  };

  return (
    <ModuleContext.Provider value={contextValue}>
      <ModuleLayout
        sidebar={sidebar}
        header={header}
        dialogs={dialogs}
        isLoading={notesStore.isLoading}
        loadFailed={notesStore.loadFailed}
        onRetry={() => void notesStore.load()}
        onBack={onOpenModules ?? navigateHome}
      />
    </ModuleContext.Provider>
  );
}
