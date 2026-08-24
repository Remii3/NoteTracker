import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LearningDashboard } from "./components/learning-dashboard";
import { StudyNavigation } from "./components/study-navigation";
import { TopicPage } from "./components/topic-page";
import { WorkspaceHeader } from "./components/workspace-header";
import { WorkspaceSidebar } from "./components/workspace-sidebar";
import { useWorkspaceActions } from "./hooks/use-workspace-actions";
import { useNoteDrafts } from "./hooks/use-note-drafts";
import { useNotesStore } from "./hooks/use-notes-store";
import { useRichTextModule } from "./hooks/use-rich-text-module";
import { useStudyKeyboardNavigation } from "./hooks/use-study-keyboard-navigation";
import { useWorkspaceDnd } from "./hooks/use-workspace-dnd";
import { useWorkspaceRoute } from "./hooks/use-workspace-route";
import { useWorkspaceUiState } from "./hooks/use-workspace-ui-state";
import {
  selectStudyTopics,
  selectVisibleChapters,
} from "./lib/chapter-selectors";
import { EMPTY_RICH_TEXT } from "./model/rich-text-content";
import type { Chapter } from "./model/types";
import type { StudyTopic } from "./model/workspace-types";
import type { NotesRepository } from "./data/notes-repository";
import type { TopicImagesService } from "./data/topic-images-service";

const AddContentDialog = lazy(() =>
  import("./components/add-content-dialog").then((module) => ({
    default: module.AddContentDialog,
  })),
);
const RenameItemDialog = lazy(() =>
  import("./components/item-dialogs").then((module) => ({
    default: module.RenameItemDialog,
  })),
);
const DeleteItemDialog = lazy(() =>
  import("./components/item-dialogs").then((module) => ({
    default: module.DeleteItemDialog,
  })),
);
const UnsavedChangesDialog = lazy(() =>
  import("./components/item-dialogs").then((module) => ({
    default: module.UnsavedChangesDialog,
  })),
);
type Props = {
  repository?: NotesRepository;
  imagesService?: TopicImagesService;
  initialChapters?: Chapter[];
  loadOnMount?: boolean;
  userName?: string;
  userEmail?: string;
  onSignOut?: () => void;
  onOpenAccount?: () => void;
};

export function NoteWorkspace({
  repository,
  imagesService,
  initialChapters,
  loadOnMount,
  userName,
  userEmail,
  onSignOut,
  onOpenAccount,
}: Props) {
  const [isSearchPending, setIsSearchPending] = useState(false);
  const { richTextModule, preloadRichTextEditor } = useRichTextModule();
  const notesStore = useNotesStore({
    repository,
    initialChapters,
    loadOnMount,
  });
  const {
    chapters,
    clearError: clearNotesError,
    error: notesError,
  } = notesStore;
  const { loadTopicContent, searchChapters, searchResults } = notesStore;
  const {
    clearDraft,
    getContent: getDraftContent,
    hasDirtyDrafts,
    isTopicDirty,
    updateDraft,
  } = useNoteDrafts();
  const {
    activeView,
    chapter,
    chapterId,
    editorDirty,
    navigateHome,
    navigateToChapter,
    navigationBlocker,
    topic,
    topicId,
  } = useWorkspaceRoute({
    chapters,
    isTopicDirty,
    isLoading: notesStore.isLoading,
    resolveChapter: notesStore.loadChapterBySlug,
  });
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
  const draftContent = topic ? getDraftContent(topic) : EMPTY_RICH_TEXT;
  const studyTopics = useMemo(() => selectStudyTopics(chapters), [chapters]);
  const studyTopicIndex = studyTopics.findIndex(
    (item) => item.topicId === topicId,
  );
  const previousStudyTopic =
    studyTopicIndex > 0 ? studyTopics[studyTopicIndex - 1] : null;
  const nextStudyTopic =
    studyTopicIndex >= 0 && studyTopicIndex < studyTopics.length - 1
      ? studyTopics[studyTopicIndex + 1]
      : null;
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
  });
  const {
    addChapter,
    addTopics,
    deleteItem: deleteManagedItem,
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
    imagesService,
    expandChapter,
    clearDraft,
    getDraftContent,
    navigateToChapter,
    navigateHome,
  });
  const openStudyTopic = useCallback(
    (item: StudyTopic) => {
      navigateToChapter(item.chapterId, item.topicId);
      expandChapter(item.chapterId);
    },
    [expandChapter, navigateToChapter],
  );

  useEffect(() => {
    if (!hasDirtyDrafts) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasDirtyDrafts]);

  useEffect(() => {
    if (!notesError) return;
    toast.error(notesError);
    clearNotesError();
  }, [clearNotesError, notesError]);

  useEffect(() => {
    if (!chapter || !topic || topic.contentLoaded !== false) return;
    void loadTopicContent(chapter.id, topic.id);
  }, [chapter, loadTopicContent, topic]);

  useStudyKeyboardNavigation({
    enabled: activeView === "notes" && !isEditing,
    topics: studyTopics,
    currentIndex: studyTopicIndex,
    onOpenTopic: openStudyTopic,
  });
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

  function selectChapter(item: Chapter) {
    requestTopicSelection(item.id, item.topics[0]?.id ?? "");
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

  function discardDraftAndOpenPreview() {
    if (topic) clearDraft(topic.id);
    setPreviewPending(false);
    setIsEditing(false);
  }

  function openHome() {
    if (activeView === "home") return;
    navigateHome();
  }

  function openChapter(nextChapterId: string, nextTopicId: string) {
    navigateToChapter(nextChapterId, nextTopicId);
    expandChapter(nextChapterId);
  }

  function changeEditingMode(nextIsEditing: boolean) {
    if (!nextIsEditing && editorDirty) {
      setPreviewPending(true);
      return;
    }
    setIsEditing(nextIsEditing);
    closeEditingUi();
  }

  if (notesStore.isLoading) {
    return (
      <main
        aria-busy="true"
        className="grid min-h-svh place-items-center bg-background"
      >
        <div className="text-center">
          <div className="mx-auto size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          <p className="mt-3 text-sm text-muted-foreground">
            Ładowanie Twoich notatek…
          </p>
        </div>
      </main>
    );
  }

  return (
    <TooltipProvider>
      <SidebarProvider
        style={{ "--sidebar-width": "20rem" } as React.CSSProperties}
      >
        <WorkspaceSidebar
          chapters={chapters}
          visibleChapters={visibleChapters}
          expandedChapters={expandedChapters}
          chapterId={chapterId}
          topicId={topicId}
          isHome={activeView === "home"}
          isEditing={isEditing}
          search={search}
          sortMode={sortMode}
          error={sidebarError}
          sensors={sensors}
          onSearchChange={changeSearch}
          onSortModeChange={setSortMode}
          onOpenHome={openHome}
          onOpenAddDialog={() => setAddDialogOpen(true)}
          onSelectChapter={selectChapter}
          onSelectTopic={requestTopicSelection}
          onToggleExpanded={toggleExpanded}
          onToggleChapter={toggleChapter}
          onToggleTopic={toggleTopic}
          onRenameItem={setRenameItem}
          onDeleteItem={setDeleteItem}
          onDragStart={handleSidebarDragStart}
          onDragOver={handleSidebarDragOver}
          onDragCancel={handleSidebarDragCancel}
          onDragEnd={handleSidebarDragEnd}
          userEmail={userEmail}
          userName={userName}
          onSignOut={onSignOut}
          onOpenAccount={onOpenAccount}
          hasMoreChapters={notesStore.hasMoreChapters}
          isLoadingMore={notesStore.isLoadingMore}
          isSearching={isSearchPending || notesStore.isSearching}
          onLoadMore={() => void notesStore.loadMoreChapters()}
        />

        <SidebarInset className="h-dvh max-h-dvh min-w-0 overflow-hidden">
          <WorkspaceHeader
            isHome={activeView === "home"}
            chapterTitle={chapter?.title}
            topicTitle={topic?.title}
            isEditing={isEditing}
            onChangeEditingMode={changeEditingMode}
            onPreloadEditor={preloadRichTextEditor}
          />

          {activeView === "home" ? (
            <LearningDashboard
              chapters={chapters}
              userName={userName}
              summary={notesStore.learningSummary}
              onOpenChapter={openChapter}
            />
          ) : (
            <TopicPage
              chapter={chapter}
              topic={topic}
              isEditing={isEditing}
              content={draftContent}
              editorDirty={editorDirty}
              isSaving={notesStore.isSaving}
              richTextModule={
                topic?.contentLoaded === false ? null : richTextModule
              }
              imagesService={imagesService}
              onContentChange={(content) => {
                if (isEditing && topic) updateDraft(topic, content);
              }}
              onSaveContent={saveContent}
              onToggleCompleted={(completed) =>
                chapter && topic && toggleTopic(chapter.id, topic.id, completed)
              }
              onAddContent={() => setAddDialogOpen(true)}
            />
          )}
          {activeView === "notes" && !isEditing && topic && (
            <StudyNavigation
              previousTopic={previousStudyTopic}
              nextTopic={nextStudyTopic}
              currentIndex={studyTopicIndex}
              total={studyTopics.length}
              onOpenTopic={openStudyTopic}
            />
          )}
        </SidebarInset>
        <Suspense fallback={null}>
          {isEditing && addDialogOpen && (
            <AddContentDialog
              open
              chapters={chapters}
              activeChapterId={chapterId}
              onOpenChange={setAddDialogOpen}
              onAddChapter={addChapter}
              onAddTopics={addTopics}
            />
          )}
          {isEditing && renameItem && (
            <RenameItemDialog
              key={`${renameItem.kind}-${renameItem.id}`}
              item={renameItem}
              onClose={() => setRenameItem(null)}
              onRename={(title) => renameManagedItem(renameItem, title)}
            />
          )}
          {isEditing && deleteItem && (
            <DeleteItemDialog
              key={`${deleteItem.kind}-${deleteItem.id}`}
              item={deleteItem}
              onClose={() => setDeleteItem(null)}
              onDelete={() => deleteManagedItem(deleteItem)}
            />
          )}
          {navigationBlocker.state === "blocked" && (
            <UnsavedChangesDialog
              onCancel={navigationBlocker.reset}
              onDiscard={discardDraftAndContinueNavigation}
            />
          )}
          {previewPending && (
            <UnsavedChangesDialog
              description="Przejście do trybu podglądu odrzuci niezapisane zmiany w treści tej notatki."
              discardLabel="Odrzuć i włącz podgląd"
              onCancel={() => setPreviewPending(false)}
              onDiscard={discardDraftAndOpenPreview}
            />
          )}
        </Suspense>
      </SidebarProvider>
    </TooltipProvider>
  );
}
