import { toast } from "sonner";

import { EMPTY_RICH_TEXT } from "../model/rich-text-content";
import { createUniqueSlug } from "../lib/slug-utils";
import type { Chapter, NoteContent, Topic } from "../model/types";
import type { ManagedItem } from "../model/workspace-types";
import type { TopicImagesService } from "../data/topic-images-service";

type Options = {
  chapters: Chapter[];
  chapterId: string;
  topicId: string;
  topic?: Topic;
  isEditing: boolean;
  isSaving: boolean;
  editorDirty: boolean;
  commands: {
    addChapter: (chapter: Chapter) => Promise<boolean>;
    addTopics: (chapterId: string, topics: Topic[]) => Promise<boolean>;
    removeItem: (item: ManagedItem) => Promise<boolean>;
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
  imagesService?: TopicImagesService;
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
  imagesService,
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

  async function addChapter(title: string) {
    if (!isEditing || isSaving) return false;
    const newChapter: Chapter = {
      id: crypto.randomUUID(),
      slug: createUniqueSlug(
        title,
        chapters.map((chapter) => chapter.slug),
        "rozdzial",
      ),
      title,
      position: (chapters.length + 1) * 1000,
      topics: [],
    };
    if (!(await commands.addChapter(newChapter))) return false;
    navigateToChapter(newChapter.id);
    expandChapter(newChapter.id);
    toast.success(`Dodano rozdział „${title}”.`);
    return true;
  }

  async function addTopics(targetChapterId: string, titles: string[]) {
    if (!isEditing || isSaving) return false;
    let firstTopicId = "";
    const targetChapter = chapters.find((item) => item.id === targetChapterId);
    if (!targetChapter) return false;
    const usedTopicSlugs = new Set(
      targetChapter.topics.map((topic) => topic.slug),
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
        position: (targetChapter.topics.length + index + 1) * 1000,
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
      const deletedTopicIds =
        chapters
          .find((chapter) => chapter.id === item.id)
          ?.topics.map((child) => child.id) ?? [];
      const remaining = chapters.filter((chapter) => chapter.id !== item.id);
      if (!(await commands.removeItem(item))) return false;
      try {
        await Promise.all(
          deletedTopicIds.map((id) => imagesService?.removeAll(id)),
        );
      } catch {
        toast.error(
          "Rozdział usunięto, ale nie udało się posprzątać wszystkich zdjęć.",
        );
      }
      if (chapterId === item.id && topic) clearDraft(topic.id);
      if (chapterId === item.id) {
        const nextChapter = remaining[0];
        if (nextChapter) {
          navigateToChapter(nextChapter.id, nextChapter.topics[0]?.id ?? "");
        } else {
          navigateHome();
        }
      }
      toast.success("Usunięto rozdział.");
      return true;
    }

    const parent = chapters.find((chapter) => chapter.id === item.chapterId);
    const remainingTopics =
      parent?.topics.filter((child) => child.id !== item.id) ?? [];
    if (!(await commands.removeItem(item))) return false;
    try {
      await imagesService?.removeAll(item.id);
    } catch {
      toast.error("Temat usunięto, ale nie udało się posprzątać jego zdjęć.");
    }
    clearDraft(item.id);
    if (topicId === item.id)
      navigateToChapter(item.chapterId, remainingTopics[0]?.id ?? "");
    toast.success("Usunięto temat.");
    return true;
  }

  return {
    addChapter,
    addTopics,
    deleteItem,
    renameItem,
    saveContent,
    toggleChapter,
    toggleTopic,
  };
}
