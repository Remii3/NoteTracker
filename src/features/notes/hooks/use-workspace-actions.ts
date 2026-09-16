import { toast } from "@/components/ui/toast";

import { EMPTY_RICH_TEXT } from "../model/rich-text-content";
import { createUniqueSlug } from "../lib/slug-utils";
import type { Chapter, NoteContent, Topic } from "../types/model";
import type { ManagedItem } from "../types/workspace-types";

type Options = {
  chapters: Chapter[];
  chapterId: string;
  topicId: string;
  topic?: Topic;
  isSaving: boolean;
  editorDirty: boolean;
  commands: {
    addChapterWithTopics: (
      chapter: Chapter,
      topics: Topic[],
    ) => Promise<boolean>;
    addTopics: (chapterId: string, topics: Topic[]) => Promise<boolean>;
    loadChapterTopics: (chapterId: string) => Promise<Topic[] | null>;
    removeItem: (item: ManagedItem) => Promise<boolean>;
    removeItems: (chapterIds: string[], topicIds: string[]) => Promise<boolean>;
    renameItem: (item: ManagedItem, title: string) => Promise<boolean>;
    saveContent: (
      chapterId: string,
      topicId: string,
      content: NoteContent,
      expectedContent: NoteContent,
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
  acknowledgeSave: (topicId: string, content: NoteContent) => boolean;
  getDraftBase?: (topic: Topic) => NoteContent;
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
  isSaving,
  editorDirty,
  commands,
  expandChapter,
  clearDraft,
  acknowledgeSave,
  getDraftContent,
  getDraftBase,
  navigateToChapter,
  navigateHome,
}: Options) {
  async function toggleChapter(id: string, completed: boolean) {
    if (isSaving) return false;
    const chapter = chapters.find((item) => item.id === id);
    const saved = await commands.toggleChapter(id, completed);
    if (!saved || !completed || !chapter?.topicsCount) return saved;

    const completedBefore = chapters.reduce(
      (sum, item) => sum + item.completedTopicsCount,
      0,
    );
    const total = chapters.reduce((sum, item) => sum + item.topicsCount, 0);
    const completedAfter =
      completedBefore + chapter.topicsCount - chapter.completedTopicsCount;
    toast.add({
      data: { type: "success" },
      description:
        completedAfter === total
          ? "Moduł ukończony."
          : `Rozdział „${chapter.title}” ukończony.`,
    });
    return saved;
  }

  async function toggleTopic(parentId: string, id: string, completed: boolean) {
    if (isSaving) return false;
    const chapter = chapters.find((item) => item.id === parentId);
    const currentTopic = chapter?.topics.find((item) => item.id === id);
    const isNewCompletion = completed && currentTopic?.completed === false;
    const saved = await commands.toggleTopic(parentId, id, completed);
    if (!saved || !isNewCompletion || !chapter) return saved;

    const completedBefore = chapters.reduce(
      (sum, item) => sum + item.completedTopicsCount,
      0,
    );
    const total = chapters.reduce((sum, item) => sum + item.topicsCount, 0);
    const completedAfter = completedBefore + 1;
    if (completedAfter === total) {
      toast.add({
        data: { type: "success" },
        description: "Moduł ukończony.",
      });
    } else if (chapter.completedTopicsCount + 1 === chapter.topicsCount) {
      toast.add({
        data: { type: "success" },
        description: `Rozdział „${chapter.title}” ukończony.`,
      });
    } else {
      toast.add({
        data: { type: "success" },
        description: `Temat ukończony — do końca modułu: ${total - completedAfter}.`,
      });
    }
    return saved;
  }

  async function saveContent() {
    if (isSaving || !topic || topic.contentLoaded === false || !editorDirty)
      return false;
    const contentToSave = getDraftContent(topic);
    const saved = await commands.saveContent(
      chapterId,
      topic.id,
      contentToSave,
      getDraftBase?.(topic) ?? topic.content,
    );
    if (!saved) return false;
    const fullySaved = acknowledgeSave(topic.id, contentToSave);
    toast.add({
      data: { type: "success" },
      description: fullySaved
        ? "Notatka została zapisana."
        : "Zapisano wcześniejszą wersję. Masz jeszcze niezapisane zmiany.",
    });
    return fullySaved;
  }

  async function addChapter(title: string, topicTitles: string[]) {
    if (isSaving || !title) return false;
    const usedSlugs = new Set(chapters.map((chapter) => chapter.slug));
    const chapterSlug = createUniqueSlug(title, usedSlugs, "rozdzial");
    const usedTopicSlugs = new Set<string>();
    const topics: Topic[] = topicTitles.map((topicTitle, index) => {
      const slug = createUniqueSlug(topicTitle, usedTopicSlugs, "temat");
      usedTopicSlugs.add(slug);
      return {
        id: crypto.randomUUID(),
        slug,
        title: topicTitle,
        content: EMPTY_RICH_TEXT,
        contentLoaded: true,
        completed: false,
        position: (index + 1) * 1000,
      };
    });
    const firstTopic = topics[0];
    const chapter: Chapter = {
      id: crypto.randomUUID(),
      slug: chapterSlug,
      title,
      position: (chapters.length + 1) * 1000,
      topicsCount: topics.length,
      completedTopicsCount: 0,
      firstIncompleteTopicId: firstTopic?.id ?? null,
      firstIncompleteTopicSlug: firstTopic?.slug ?? null,
      topics,
      topicsStatus: "loaded",
    };
    if (!(await commands.addChapterWithTopics(chapter, topics))) return false;
    navigateToChapter(chapter.id, firstTopic?.id);
    expandChapter(chapter.id);
    toast.add({
      data: { type: "success" },
      description: topicTitles.length
        ? `Dodano rozdział „${title}” wraz z tematami.`
        : `Dodano rozdział „${title}”.`,
    });
    return true;
  }

  async function addTopics(targetChapterId: string, titles: string[]) {
    if (isSaving) return false;
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
    toast.add({
      data: { type: "success" },
      description:
        titles.length === 1
          ? `Dodano temat „${titles[0]}”.`
          : `Dodano ${titles.length} tematów.`,
    });
    return true;
  }

  async function renameItem(item: ManagedItem, title: string) {
    if (isSaving) return false;
    if (item.kind === "chapter") {
      if (!(await commands.renameItem(item, title))) return false;
      toast.add({
        data: { type: "success" },
        description: "Zmieniono nazwę rozdziału.",
      });
      return true;
    }
    if (!(await commands.renameItem(item, title))) return false;
    toast.add({
      data: { type: "success" },
      description: "Zmieniono nazwę tematu.",
    });
    return true;
  }

  async function deleteItem(item: ManagedItem) {
    if (isSaving) return false;
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
      toast.add({
        data: { type: "success" },
        description: "Rozdział przeniesiono do usuniętych.",
      });
      return true;
    }

    const parent = chapters.find((chapter) => chapter.id === item.chapterId);
    const remainingTopics =
      parent?.topics.filter((child) => child.id !== item.id) ?? [];
    if (!(await commands.removeItem(item))) return false;
    clearDraft(item.id);
    if (topicId === item.id)
      navigateToChapter(item.chapterId, remainingTopics[0]?.id ?? "");
    toast.add({
      data: { type: "success" },
      description: "Temat przeniesiono do usuniętych.",
    });
    return true;
  }

  async function deleteItems(chapterIds: string[], topicIds: string[]) {
    if (isSaving || (!chapterIds.length && !topicIds.length)) return false;

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
    toast.add({
      data: { type: "success" },
      description:
        deletedCount === 1
          ? "Element przeniesiono do usuniętych."
          : `${deletedCount} elementów przeniesiono do usuniętych.`,
    });
    return true;
  }

  return {
    addChapter,
    addTopics,
    deleteItem,
    deleteItems,
    renameItem,
    saveContent,
    toggleChapter,
    toggleTopic,
  };
}
