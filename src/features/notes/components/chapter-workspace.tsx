import { useCallback, useEffect } from "react";

import { LoadError } from "@/components/load-error";
import { Skeleton } from "@/components/ui/skeleton";
import type { QuestionsRepository } from "@/features/questions/data/questions-repository";
import { StudyNavigation } from "./study-navigation";
import { TopicPage } from "./topic-page";
import type { TopicImagesService } from "../data/topic-images-service";
import { useStudyKeyboardNavigation } from "../hooks/use-study-keyboard-navigation";
import type { RichTextModule } from "../hooks/use-rich-text-module";
import { EMPTY_RICH_TEXT } from "../model/rich-text-content";
import type {
  Chapter,
  NoteContent,
  Topic,
  TopicNavigation,
  TopicNavigationItem,
} from "../types/model";

type Props = {
  chapter?: Chapter;
  topic?: Topic;
  chapterId: string;
  chapters: Chapter[];
  contentErrors: Record<string, string>;
  editorDirty: boolean;
  imagesService?: TopicImagesService;
  isEditing: boolean;
  isSaving: boolean;
  questionsRepository?: QuestionsRepository;
  richTextModule: RichTextModule | null;
  storageError: string | null;
  topicNavigation: TopicNavigation | null;
  expandChapter: (chapterId: string) => void;
  getDraftContent: (topic: Topic) => NoteContent;
  loadChapterTopics: (chapterId: string) => Promise<Topic[] | null>;
  loadTopicContent: (chapterId: string, topicId: string) => Promise<boolean>;
  loadTopicNavigation: (topicId: string) => Promise<TopicNavigation | null>;
  navigateHome: () => void;
  navigateToChapter: (chapterId: string, topicId?: string) => void;
  onAddContent: () => void;
  onContinueEditing: () => void;
  onSaveContent: () => Promise<boolean>;
  onToggleTopic: (
    chapterId: string,
    topicId: string,
    completed: boolean,
  ) => Promise<boolean>;
  reconcileDraft: (topic: Topic) => void;
  updateDraft: (topic: Topic, content: NoteContent) => void;
};

export function ChapterWorkspace({
  chapter,
  topic,
  chapterId,
  chapters,
  contentErrors,
  editorDirty,
  imagesService,
  isEditing,
  isSaving,
  questionsRepository,
  richTextModule,
  storageError,
  topicNavigation,
  expandChapter,
  getDraftContent,
  loadChapterTopics,
  loadTopicContent,
  loadTopicNavigation,
  navigateHome,
  navigateToChapter,
  onAddContent,
  onContinueEditing,
  onSaveContent,
  onToggleTopic,
  reconcileDraft,
  updateDraft,
}: Props) {
  const topicId = topic?.id;
  const openStudyTopic = useCallback(
    async (item: TopicNavigationItem) => {
      await loadChapterTopics(item.chapterId);
      navigateToChapter(item.chapterId, item.topicId);
      expandChapter(item.chapterId);
    },
    [expandChapter, loadChapterTopics, navigateToChapter],
  );

  useEffect(() => {
    if (
      !chapter ||
      !topic ||
      topic.contentLoaded !== false ||
      contentErrors[topic.id]
    )
      return;
    void loadTopicContent(chapter.id, topic.id);
  }, [chapter, contentErrors, loadTopicContent, topic]);

  useEffect(() => {
    if (!topic || topic.contentLoaded === false) return;
    reconcileDraft(topic);
  }, [reconcileDraft, topic]);

  useEffect(() => {
    if (!topicId) return;
    void loadTopicNavigation(topicId);
  }, [loadTopicNavigation, topicId]);

  useStudyKeyboardNavigation({
    enabled: !isEditing,
    previousTopic: topicNavigation?.previous ?? null,
    nextTopic: topicNavigation?.next ?? null,
    onOpenTopic: openStudyTopic,
  });

  return (
    <>
      {editorDirty && !isEditing && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 border-b p-4 text-sm"
        >
          <p>Odzyskano niezapisany szkic tej notatki.</p>
          <button className="font-medium underline" onClick={onContinueEditing}>
            Kontynuuj edycję
          </button>
        </div>
      )}
      {storageError && (
        <p role="alert" className="p-4 text-sm text-destructive">
          {storageError}
        </p>
      )}
      {chapter?.topicsStatus === "error" ? (
        <LoadError
          message="Nie udało się pobrać tematów."
          onRetry={() => void loadChapterTopics(chapter.id)}
          onBack={navigateHome}
        />
      ) : chapter && chapter.topicsStatus !== "loaded" ? (
        <ChapterLoadingSkeleton />
      ) : topic && contentErrors[topic.id] ? (
        <LoadError
          message={contentErrors[topic.id]}
          onRetry={() => void loadTopicContent(chapterId, topic.id)}
          onBack={navigateHome}
        />
      ) : (
        <TopicPage
          chapter={chapter}
          topic={topic}
          isEditing={isEditing}
          content={topic ? getDraftContent(topic) : EMPTY_RICH_TEXT}
          editorDirty={editorDirty}
          isSaving={isSaving}
          richTextModule={
            topic?.contentLoaded === false ? null : richTextModule
          }
          imagesService={imagesService}
          questionsRepository={questionsRepository}
          chapters={chapters}
          loadChapterTopics={loadChapterTopics}
          onContentChange={(content) => {
            if (isEditing && topic) updateDraft(topic, content);
          }}
          onSaveContent={onSaveContent}
          onToggleCompleted={(completed) =>
            chapter && topic && onToggleTopic(chapter.id, topic.id, completed)
          }
          onAddContent={onAddContent}
        />
      )}
      {!isEditing && topic && (
        <StudyNavigation
          previousTopic={topicNavigation?.previous ?? null}
          nextTopic={topicNavigation?.next ?? null}
          currentIndex={topicNavigation?.currentIndex ?? 0}
          total={topicNavigation?.total ?? 0}
          onOpenTopic={openStudyTopic}
        />
      )}
    </>
  );
}

function ChapterLoadingSkeleton() {
  return (
    <main
      className="min-h-0 flex-1 overflow-hidden px-5 py-8 sm:px-8 lg:px-12 lg:py-12"
      role="status"
      aria-busy="true"
      aria-label="Ładowanie rozdziału"
    >
      <div className="mx-auto max-w-6xl space-y-10" aria-hidden="true">
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-80 max-w-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-11/12" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      </div>
    </main>
  );
}
