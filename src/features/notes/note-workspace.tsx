import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { useParams } from "react-router";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLoading } from "@/components/app-loading";
import { LearningDashboard } from "./components/learning-dashboard";
import { ChaptersOverview } from "./components/chapters-overview";
import { GalleryPage } from "./components/gallery-page";
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
import { selectVisibleChapters } from "./lib/chapter-selectors";
import { EMPTY_RICH_TEXT } from "./model/rich-text-content";
import type { Chapter, TopicNavigationItem } from "./model/types";
import type { NotesRepository } from "./data/notes-repository";
import type { TopicImagesService } from "./data/topic-images-service";
import { QuestionsPage } from "@/features/questions/components/questions-page";
import { StudySession } from "@/features/questions/components/study-session";
import { StudyHistoryPage } from "@/features/questions/components/study-history-page";
import type { QuestionsRepository } from "@/features/questions/data/questions-repository";
import type { ModulesRepository } from "@/features/modules/data/modules-repository";
import { MoveChapterDialog } from "@/features/modules/move-chapter-dialog";

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
const BulkDeleteDialog = lazy(() =>
  import("./components/bulk-delete-dialog").then((module) => ({
    default: module.BulkDeleteDialog,
  })),
);
type Props = {
  repository?: NotesRepository;
  imagesService?: TopicImagesService;
  questionsRepository?: QuestionsRepository;
  modulesRepository?: ModulesRepository;
  initialChapters?: Chapter[];
  loadOnMount?: boolean;
  userName?: string;
  userEmail?: string;
  moduleName?: string;
  onOpenModules?: () => void;
  onSignOut?: () => void;
  onOpenAccount?: () => void;
};

export function NoteWorkspace({
  repository,
  imagesService,
  questionsRepository,
  modulesRepository,
  initialChapters,
  loadOnMount,
  userName,
  userEmail,
  moduleName,
  onOpenModules,
  onSignOut,
  onOpenAccount,
}: Props) {
  const { moduleId = "", sessionId } = useParams<{
    moduleId: string;
    sessionId: string;
  }>();
  const [isSearchPending, setIsSearchPending] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [movedChapter, setMovedChapter] = useState<Chapter | null>(null);
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
  const {
    loadChapterTopics,
    loadTopicContent,
    loadTopicNavigation,
    searchChapters,
    searchResults,
  } = notesStore;
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
    navigateChapters,
    navigateGallery,
    navigateQuestions,
    navigateQuestionHistory,
    navigateStudySession,
    navigateToChapter,
    navigationBlocker,
    topic,
    topicId,
    isQuestionHistory,
  } = useWorkspaceRoute({
    chapters,
    isTopicDirty,
    isLoading: notesStore.isLoading,
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
  const draftContent = topic ? getDraftContent(topic) : EMPTY_RICH_TEXT;
  const previousStudyTopic = notesStore.topicNavigation?.previous ?? null;
  const nextStudyTopic = notesStore.topicNavigation?.next ?? null;
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
    getDraftContent,
    navigateToChapter,
    navigateHome,
  });
  const openStudyTopic = useCallback(
    async (item: TopicNavigationItem) => {
      await loadChapterTopics(item.chapterId);
      navigateToChapter(item.chapterId, item.topicId);
      expandChapter(item.chapterId);
    },
    [expandChapter, loadChapterTopics, navigateToChapter],
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

  useEffect(() => {
    if (!topicId) return;
    void loadTopicNavigation(topicId);
  }, [loadTopicNavigation, topicId]);

  useStudyKeyboardNavigation({
    enabled: activeView === "notes" && !isEditing,
    previousTopic: previousStudyTopic,
    nextTopic: nextStudyTopic,
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

  function openHome() {
    if (activeView === "home") return;
    navigateHome();
  }

  function openChapters() {
    if (activeView === "chapters") return;
    navigateChapters();
  }

  function openQuestions() {
    if (activeView === "questions" && !sessionId && !isQuestionHistory) return;
    navigateQuestions();
  }

  function openGallery() {
    if (activeView === "gallery") return;
    navigateGallery();
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

  if (notesStore.isLoading) {
    return <AppLoading />;
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
          isChapters={activeView === "chapters"}
          isGallery={activeView === "gallery"}
          isQuestions={activeView === "questions"}
          isEditing={isEditing}
          search={search}
          sortMode={sortMode}
          error={sidebarError}
          sensors={sensors}
          onSearchChange={changeSearch}
          onSortModeChange={setSortMode}
          onOpenHome={openHome}
          onOpenChapters={openChapters}
          onOpenGallery={openGallery}
          onOpenQuestions={openQuestions}
          onOpenAddDialog={() => setAddDialogOpen(true)}
          onSelectChapter={selectChapter}
          onSelectTopic={requestTopicSelection}
          onToggleExpanded={(nextChapterId, open) => {
            toggleExpanded(nextChapterId, open);
            if (open) void loadChapterTopics(nextChapterId, { prefetch: true });
          }}
          onPrefetchTopics={(nextChapterId) =>
            void loadChapterTopics(nextChapterId, { prefetch: true })
          }
          onToggleChapter={toggleChapter}
          onToggleTopic={toggleTopic}
          onRenameItem={setRenameItem}
          onDeleteItem={setDeleteItem}
          onMoveChapter={modulesRepository ? setMovedChapter : undefined}
          onDragStart={handleSidebarDragStart}
          onDragOver={handleSidebarDragOver}
          onDragCancel={handleSidebarDragCancel}
          onDragEnd={handleSidebarDragEnd}
          userEmail={userEmail}
          moduleName={moduleName}
          onOpenModules={onOpenModules}
          userName={userName}
          onSignOut={onSignOut}
          onOpenAccount={onOpenAccount}
          isSearching={isSearchPending || notesStore.isSearching}
        />

        <SidebarInset className="h-dvh max-h-dvh min-w-0 overflow-hidden">
          <WorkspaceHeader
            isHome={activeView === "home"}
            isChapters={activeView === "chapters"}
            isGallery={activeView === "gallery"}
            isQuestions={activeView === "questions"}
            isQuestionHistory={isQuestionHistory}
            chapterTitle={chapter?.title}
            topicTitle={topic?.title}
            isEditing={isEditing}
            onChangeEditingMode={changeEditingMode}
            onPreloadEditor={preloadRichTextEditor}
            onOpenAddDialog={() => setAddDialogOpen(true)}
            onOpenBulkDelete={() => setBulkDeleteOpen(true)}
          />

          {activeView === "home" ? (
            <LearningDashboard
              chapters={chapters}
              userName={userName}
              summary={notesStore.learningSummary}
              onOpenChapter={openChapter}
              onBrowseChapters={openChapters}
            />
          ) : activeView === "chapters" ? (
            <ChaptersOverview chapters={chapters} onOpenChapter={openChapter} />
          ) : activeView === "gallery" ? (
            <GalleryPage
              key={`${moduleId}:${sortMode}`}
              moduleId={moduleId}
              sortMode={sortMode}
              service={imagesService}
              onOpenTopic={openChapter}
            />
          ) : activeView === "questions" && questionsRepository ? (
            sessionId ? (
              <StudySession
                sessionId={sessionId}
                repository={questionsRepository}
                onClose={navigateQuestions}
              />
            ) : isQuestionHistory ? (
              <StudyHistoryPage
                repository={questionsRepository}
                onBack={navigateQuestions}
                onOpenSession={navigateStudySession}
              />
            ) : (
              <QuestionsPage
                chapters={orderedChapters}
                repository={questionsRepository}
                loadTopics={loadChapterTopics}
                onOpenSession={navigateStudySession}
                onOpenHistory={navigateQuestionHistory}
              />
            )
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
              questionsRepository={questionsRepository}
              chapters={orderedChapters}
              loadChapterTopics={loadChapterTopics}
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
              currentIndex={notesStore.topicNavigation?.currentIndex ?? 0}
              total={notesStore.topicNavigation?.total ?? 0}
              onOpenTopic={openStudyTopic}
            />
          )}
        </SidebarInset>
        <Suspense fallback={null}>
          {isEditing && addDialogOpen && (
            <AddContentDialog
              open
              chapters={orderedChapters}
              activeChapterId={chapterId}
              onOpenChange={setAddDialogOpen}
              onAddChapters={addChapters}
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
          {isEditing && bulkDeleteOpen && (
            <BulkDeleteDialog
              chapters={orderedChapters}
              onClose={() => setBulkDeleteOpen(false)}
              onLoadTopics={loadChapterTopics}
              onDelete={deleteManagedItems}
            />
          )}
          {navigationBlocker.state === "blocked" && (
            <UnsavedChangesDialog
              onCancel={navigationBlocker.reset}
              onDiscard={discardDraftAndContinueNavigation}
              onSave={saveDraftAndContinueNavigation}
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
          {movedChapter && modulesRepository && (
            <MoveChapterDialog
              chapter={movedChapter}
              currentModuleId={moduleId}
              repository={modulesRepository}
              onClose={() => setMovedChapter(null)}
              onMoved={async () => {
                navigateHome();
                await notesStore.load();
              }}
            />
          )}
        </Suspense>
      </SidebarProvider>
    </TooltipProvider>
  );
}
