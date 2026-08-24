import { useRef, type Dispatch, type SetStateAction } from "react";
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { toast } from "sonner";

import {
  moveTopic,
  reorderChapters,
  reorderTopic,
} from "../domain/chapter-operations";
import { titlesAreEqual } from "../lib/title-utils";
import type { Chapter } from "../model/types";
import type { SortMode } from "../model/workspace-types";

type NavigateToChapter = (
  chapterId: string,
  topicId?: string,
  replace?: boolean,
) => void;

type Options = {
  chapters: Chapter[];
  chapterId: string;
  topicId: string;
  isEditing: boolean;
  isSaving: boolean;
  sortMode: SortMode;
  previewChapters: (updater: (chapters: Chapter[]) => Chapter[]) => void;
  restoreChapters: (chapters: Chapter[]) => void;
  commitDrag: (
    previous: Chapter[],
    next: Chapter[],
    activeType: "chapter" | "topic",
    activeId: string,
  ) => Promise<boolean>;
  expandChapter: (chapterId: string) => void;
  setError: Dispatch<SetStateAction<string | null>>;
  navigateToChapter: NavigateToChapter;
  loadChapterTopics: (
    chapterId: string,
    options?: { prefetch?: boolean },
  ) => Promise<unknown>;
};

export function useWorkspaceDnd({
  chapters,
  chapterId,
  topicId,
  isEditing,
  isSaving,
  sortMode,
  previewChapters,
  restoreChapters,
  commitDrag,
  expandChapter,
  setError,
  navigateToChapter,
  loadChapterTopics,
}: Options) {
  const dragSnapshot = useRef<Chapter[] | null>(null);
  const dragSelectionSnapshot = useRef<{
    chapterId: string;
    topicId: string;
  } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragStart({ active }: DragStartEvent) {
    if (!isEditing || isSaving) return;
    dragSnapshot.current = chapters;
    dragSelectionSnapshot.current = { chapterId, topicId };
    setError(null);
    if (active.data.current?.type !== "topic") return;
  }

  function handleDragCancel() {
    if (dragSnapshot.current) restoreChapters(dragSnapshot.current);
    if (dragSelectionSnapshot.current) {
      navigateToChapter(
        dragSelectionSnapshot.current.chapterId,
        dragSelectionSnapshot.current.topicId,
        true,
      );
    }
    dragSnapshot.current = null;
    dragSelectionSnapshot.current = null;
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (
      !isEditing ||
      isSaving ||
      !over ||
      active.data.current?.type !== "topic"
    )
      return;
    const sourceChapter = chapters.find((item) =>
      item.topics.some((topic) => topic.id === active.id),
    );
    const overType = over.data.current?.type;
    const targetChapterId =
      overType === "chapter"
        ? String(over.id)
        : String(over.data.current?.chapterId ?? "");
    if (
      !sourceChapter ||
      !targetChapterId ||
      sourceChapter.id === targetChapterId
    )
      return;

    const movedTopic = sourceChapter.topics.find(
      (topic) => topic.id === active.id,
    );
    const targetChapter = chapters.find((item) => item.id === targetChapterId);
    if (!movedTopic || !targetChapter) return;
    if (targetChapter.topicsStatus !== "loaded") {
      expandChapter(targetChapterId);
      void loadChapterTopics(targetChapterId, { prefetch: true });
      return;
    }

    const duplicate = targetChapter.topics.some((item) =>
      titlesAreEqual(item.title, movedTopic.title),
    );
    if (duplicate) {
      setError(
        `Temat „${movedTopic.title}” już istnieje w rozdziale „${targetChapter.title}”.`,
      );
      return;
    }

    previewChapters((current) => {
      const target = current.find((item) => item.id === targetChapterId);
      if (!target) return current;
      const targetIndex =
        overType === "topic"
          ? target.topics.findIndex((topic) => topic.id === over.id)
          : target.topics.length;
      return moveTopic(
        current,
        String(active.id),
        targetChapterId,
        targetIndex,
      );
    });
    if (topicId === active.id)
      navigateToChapter(targetChapterId, topicId, true);
    expandChapter(targetChapterId);
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    if (!isEditing || isSaving) return;
    if (!over) {
      handleDragCancel();
      return;
    }

    const originalChapter = dragSnapshot.current?.find((item) =>
      item.topics.some((topic) => topic.id === active.id),
    );
    const currentChapter = chapters.find((item) =>
      item.topics.some((topic) => topic.id === active.id),
    );
    const movedBetweenChapters =
      originalChapter &&
      currentChapter &&
      originalChapter.id !== currentChapter.id;
    const previous = dragSnapshot.current;
    dragSnapshot.current = null;
    dragSelectionSnapshot.current = null;

    if (active.id === over.id) {
      if (
        movedBetweenChapters &&
        previous &&
        (await commitDrag(previous, chapters, "topic", String(active.id)))
      )
        toast.success(`Przeniesiono temat do „${currentChapter.title}”.`);
      return;
    }
    setError(null);

    const activeType = active.data.current?.type;
    const overType = over.data.current?.type;
    const overChapterId =
      overType === "chapter"
        ? String(over.id)
        : String(over.data.current?.chapterId ?? "");

    if (activeType === "chapter") {
      if (sortMode !== "manual" || !overChapterId) return;
      const next = reorderChapters(chapters, String(active.id), overChapterId);
      previewChapters(() => next);
      if (previous)
        await commitDrag(previous, next, "chapter", String(active.id));
      return;
    }

    if (activeType !== "topic" || !overChapterId) return;
    const sourceChapter = chapters.find((item) =>
      item.topics.some((topic) => topic.id === active.id),
    );
    const sourceChapterId = sourceChapter?.id ?? "";
    const movedTopic = sourceChapter?.topics.find(
      (item) => item.id === active.id,
    );
    const targetChapter = chapters.find((item) => item.id === overChapterId);
    if (!movedTopic || !targetChapter) return;

    if (
      sourceChapterId !== overChapterId &&
      targetChapter.topics.some(
        (item) =>
          item.id !== active.id && titlesAreEqual(item.title, movedTopic.title),
      )
    ) {
      setError(
        `Temat „${movedTopic.title}” już istnieje w rozdziale „${targetChapter.title}”.`,
      );
      return;
    }

    let nextChapters = chapters;
    previewChapters((current) => {
      if (sourceChapterId === overChapterId) {
        nextChapters = reorderTopic(
          current,
          sourceChapterId,
          String(active.id),
          String(over.id),
        );
        return nextChapters;
      }
      const targetIndex =
        overType === "topic"
          ? targetChapter.topics.findIndex((topic) => topic.id === over.id)
          : targetChapter.topics.length;
      nextChapters = moveTopic(
        current,
        String(active.id),
        overChapterId,
        targetIndex,
      );
      return nextChapters;
    });
    const saved = previous
      ? await commitDrag(previous, nextChapters, "topic", String(active.id))
      : false;
    if (!saved) return;
    navigateToChapter(overChapterId, String(active.id), true);
    expandChapter(overChapterId);
    if (movedBetweenChapters)
      toast.success(`Przeniesiono temat do „${currentChapter.title}”.`);
  }

  return {
    sensors,
    handleDragCancel,
    handleDragEnd,
    handleDragOver,
    handleDragStart,
  };
}
