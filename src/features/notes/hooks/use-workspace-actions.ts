import { toast } from "sonner";

import { EMPTY_RICH_TEXT } from "../model/rich-text-content";
import { createUniqueSlug } from "../lib/slug-utils";
import type { Chapter, NoteContent, Topic } from "../model/types";
import type { ManagedItem } from "../model/workspace-types";

type Options = {
  chapters: Chapter[];
  chapterId: string;
  topicId: string;
  topic?: Topic;
  isEditing: boolean;
  isSaving: boolean;
  editorDirty: boolean;
  commands: {
    addChapters: (chapters: Chapter[]) => Promise<boolean>;
    addTopics: (chapterId: string, topics: Topic[]) => Promise<boolean>;
    loadChapterTopics: (chapterId: string) => Promise<Topic[] | null>;
    removeItem: (item: ManagedItem) => Promise<boolean>;
    removeItems: (chapterIds: string[], topicIds: string[]) => Promise<boolean>;
    renameItem: (item: ManagedItem, title: string) => Promise<boolean>;
    saveContent: (
      chapterId: string,
      topicId: string,
      content: NoteContent,
    ) => Promise<boolean>;
    toggleChapter: (chapterId: string, completed: boolean) => Promise<boolean>;
    toggleTopic: (
      chapterId: string,
      topicId: string,
      completed: boolean,
    ) => Promise<boolean>;
  };
  expandChapter: (chapterId: string) => void;
  clearDraft: (topicId: string) => void;
  getDraftContent: (topic: Topic) => Topic["content"];
  navigateToChapter: (
    chapterId: string,
    topicId?: string,
    replace?: boolean,
  ) => void;
  navigateHome: () => void;
};

export function useWorkspaceActions({
  chapters,
  chapterId,
  topicId,
  topic,
  isEditing,
  isSaving,
  editorDirty,
  commands,
  expandChapter,
  clearDraft,
  getDraftContent,
  navigateToChapter,
  navigateHome,
}: Options) {
  async function toggleChapter(id: string, completed: boolean) {
    if (isSaving) return false;
    return commands.toggleChapter(id, completed);
  }

  async function toggleTopic(parentId: string, id: string, completed: boolean) {
    if (isSaving) return false;
    return commands.toggleTopic(parentId, id, completed);
  }

  async function saveContent() {
    if (!isEditing || isSaving || !topic || !editorDirty) return false;
    const contentToSave = getDraftContent(topic);
    const saved = await commands.saveContent(
      chapterId,
      topic.id,
      contentToSave,
    );
    if (!saved) return false;
    clearDraft(topic.id);
    toast.success("Notatka została zapisana.");
    return true;
  }

  async function addChapters(titles: string[]) {
    if (!isEditing || isSaving || !titles.length) return false;
    const usedSlugs = new Set(chapters.map((chapter) => chapter.slug));
    const newChapters: Chapter[] = titles.map((title, index) => {
      const slug = createUniqueSlug(title, usedSlugs, "rozdzial");
      usedSlugs.add(slug);
      return {
        id: crypto.randomUUID(),
        slug,
        title,
        position: (chapters.length + index + 1) * 1000,
        topicsCount: 0,
        completedTopicsCount: 0,
        firstIncompleteTopicId: null,
        firstIncompleteTopicSlug: null,
        topics: [],
        topicsStatus: "loaded",
      };
    });
    if (!(await commands.addChapters(newChapters))) return false;
    const firstChapter = newChapters[0];
    navigateToChapter(firstChapter.id);
    expandChapter(firstChapter.id);
    toast.success(
      titles.length === 1
        ? `Dodano rozdział „${titles[0]}”.`
        : `Dodano ${titles.length} rozdziałów.`,
    );
    return true;
  }

  async function addTopics(targetChapterId: string, titles: string[]) {
    if (!isEditing || isSaving) return false;
    let firstTopicId = "";
    const loadedTopics = await commands.loadChapterTopics(targetChapterId);
    const targetChapter = chapters.find((item) => item.id === targetChapterId);
    if (!targetChapter) return false;
    const usedTopicSlugs = new Set(
      (loadedTopics ?? targetChapter.topics).map((topic) => topic.slug),
    );
    const newTopics = titles.map((title, index) => {
      const id = crypto.randomUUID();
      const slug = createUniqueSlug(title, usedTopicSlugs, "temat");
      usedTopicSlugs.add(slug);
      if (!firstTopicId) firstTopicId = id;
      return {
        id,
        slug,
        title,
        content: EMPTY_RICH_TEXT,
        contentLoaded: true,
        completed: false,
        position:
          ((loadedTopics?.length ?? targetChapter.topics.length) + index + 1) *
          1000,
      };
    });
    if (!(await commands.addTopics(targetChapterId, newTopics))) return false;
    navigateToChapter(targetChapterId, firstTopicId);
    expandChapter(targetChapterId);
    toast.success(
      titles.length === 1
        ? `Dodano temat „${titles[0]}”.`
        : `Dodano ${titles.length} tematów.`,
    );
    return true;
  }

  async function renameItem(item: ManagedItem, title: string) {
    if (!isEditing || isSaving) return false;
    if (item.kind === "chapter") {
      if (!(await commands.renameItem(item, title))) return false;
      toast.success("Zmieniono nazwę rozdziału.");
      return true;
    }
    if (!(await commands.renameItem(item, title))) return false;
    toast.success("Zmieniono nazwę tematu.");
    return true;
  }

  async function deleteItem(item: ManagedItem) {
    if (!isEditing || isSaving) return false;
    if (item.kind === "chapter") {
      const remaining = chapters.filter((chapter) => chapter.id !== item.id);
      if (!(await commands.removeItem(item))) return false;
      if (chapterId === item.id && topic) clearDraft(topic.id);
      if (chapterId === item.id) {
        const nextChapter = remaining[0];
        if (nextChapter) {
          navigateToChapter(nextChapter.id, nextChapter.topics[0]?.id ?? "");
        } else {
          navigateHome();
        }
      }
      toast.success("Rozdział przeniesiono do usuniętych.");
      return true;
    }

    const parent = chapters.find((chapter) => chapter.id === item.chapterId);
    const remainingTopics =
      parent?.topics.filter((child) => child.id !== item.id) ?? [];
    if (!(await commands.removeItem(item))) return false;
    clearDraft(item.id);
    if (topicId === item.id)
      navigateToChapter(item.chapterId, remainingTopics[0]?.id ?? "");
    toast.success("Temat przeniesiono do usuniętych.");
    return true;
  }

  async function deleteItems(chapterIds: string[], topicIds: string[]) {
    if (!isEditing || isSaving || (!chapterIds.length && !topicIds.length))
      return false;

    const selectedChapters = new Set(chapterIds);
    const topicIdsForCleanup = new Set(topicIds);
    for (const selectedChapterId of chapterIds) {
      const topics = await commands.loadChapterTopics(selectedChapterId);
      if (!topics) return false;
      for (const child of topics) topicIdsForCleanup.add(child.id);
    }

    if (!(await commands.removeItems(chapterIds, topicIds))) return false;

    for (const deletedTopicId of topicIdsForCleanup) clearDraft(deletedTopicId);

    if (
      selectedChapters.has(chapterId) ||
      (topicId && topicIdsForCleanup.has(topicId))
    ) {
      const remaining = chapters.filter(
        (chapter) => !selectedChapters.has(chapter.id),
      );
      const nextChapter =
        remaining.find((chapter) => chapter.id === chapterId) ?? remaining[0];
      if (nextChapter) navigateToChapter(nextChapter.id);
      else navigateHome();
    }

    const deletedCount = chapterIds.length + topicIds.length;
    toast.success(
      deletedCount === 1
        ? "Element przeniesiono do usuniętych."
        : `${deletedCount} elementów przeniesiono do usuniętych.`,
    );
    return true;
  }

  return {
    addChapters,
    addTopics,
    deleteItem,
    deleteItems,
    renameItem,
    saveContent,
    toggleChapter,
    toggleTopic,
  };
}
