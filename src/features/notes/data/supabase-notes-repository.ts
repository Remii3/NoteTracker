import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/database.types";
import type {
  ChapterUpdate,
  NotesRepository,
  TopicUpdate,
} from "./notes-repository";
import { NoteContentConflictError } from "./notes-repository";
import type {
  ChapterSummary,
  LearningSummary,
  NoteContent,
  Topic,
  TopicNavigation,
} from "../types/model";
import { EMPTY_RICH_TEXT } from "../model/rich-text-content";
import { throwIfPostgrestError } from "./supabase-error";
import { clearMemoryCacheByPrefix } from "@/lib/memory-cache";
import type { OfflineModuleChanges } from "../offline/offline-types";
import type { ContentModuleImportDraft } from "@/features/modules/import/import-model";
import { createContentImportPayload } from "@/features/modules/import/import-model";

export class SupabaseNotesRepository implements NotesRepository {
  private readonly client: SupabaseClient<Database>;
  private readonly userId: string;
  private readonly moduleId: string;

  private clearStatisticsCache() {
    clearMemoryCacheByPrefix(`statistics:${this.userId}:`);
    clearMemoryCacheByPrefix(`modules:${this.userId}`);
  }

  constructor(
    client: SupabaseClient<Database>,
    userId: string,
    moduleId: string,
  ) {
    this.client = client;
    this.userId = userId;
    this.moduleId = moduleId;
  }

  async getOfflineChanges(changedSince?: string, includeImages = false) {
    const { data, error } = await this.client.rpc(
      "get_offline_module_changes",
      {
        target_module_id: this.moduleId,
        changed_since: changedSince ?? null,
        include_images: includeImages,
      },
    );
    throwIfPostgrestError(error);
    if (!data) throw new Error("Moduł nie istnieje lub jest niedostępny.");
    return data as unknown as OfflineModuleChanges;
  }

  async listChapters() {
    const { data, error } = await this.client.rpc("get_chapter_summaries", {
      target_module_id: this.moduleId,
    });
    throwIfPostgrestError(error);
    return ((data ?? []) as unknown as ChapterSummary[]).map((chapter) => ({
      ...chapter,
      topics: [],
      topicsStatus: "idle" as const,
    }));
  }

  async listChapterTopics(chapterId: string) {
    const { data, error } = await this.client
      .from("topics")
      .select("id,slug,title,completed,position")
      .eq("chapter_id", chapterId)
      .eq("user_id", this.userId)
      .is("trash_id", null)
      .order("position")
      .order("id");
    throwIfPostgrestError(error);
    return (data ?? []).map((topic) => ({
      ...topic,
      content: EMPTY_RICH_TEXT,
      contentLoaded: false,
    }));
  }

  async getTopicContent(chapterId: string, topicId: string) {
    const { data, error } = await this.client
      .from("topics")
      .select("content")
      .eq("id", topicId)
      .eq("chapter_id", chapterId)
      .eq("user_id", this.userId)
      .is("trash_id", null)
      .single();
    throwIfPostgrestError(error);
    if (!data) throw new Error("Nie znaleziono notatki.");
    return data.content as NoteContent;
  }

  getFreshTopicContent(chapterId: string, topicId: string) {
    return this.getTopicContent(chapterId, topicId);
  }

  async getTopicNavigation(topicId: string) {
    const { data, error } = await this.client.rpc("get_topic_navigation", {
      target_module_id: this.moduleId,
      current_topic_id: topicId,
    });
    throwIfPostgrestError(error);
    if (!data) throw new Error("Nie znaleziono tematu.");
    return data as unknown as TopicNavigation;
  }

  async searchChapters(query: string, limit = 100) {
    const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    const [chapterResult, topicResult] = await Promise.all([
      this.client
        .from("chapters")
        .select("id,slug,title,position")
        .eq("user_id", this.userId)
        .eq("module_id", this.moduleId)
        .ilike("title", pattern)
        .is("trash_id", null)
        .order("position")
        .limit(limit),
      this.client
        .from("topics")
        .select(
          "id,slug,title,completed,position,chapter_id,chapters!inner(id,slug,title,position)",
        )
        .ilike("title", pattern)
        .eq("user_id", this.userId)
        .eq("chapters.module_id", this.moduleId)
        .is("trash_id", null)
        .is("chapters.trash_id", null)
        .order("position")
        .limit(limit),
    ]);
    throwIfPostgrestError(chapterResult.error);
    throwIfPostgrestError(topicResult.error);

    const chapters = new Map<string, import("../types/model").Chapter>();
    for (const chapter of chapterResult.data ?? []) {
      chapters.set(chapter.id, {
        ...chapter,
        topicsCount: 0,
        completedTopicsCount: 0,
        firstIncompleteTopicId: null,
        firstIncompleteTopicSlug: null,
        topics: [],
        topicsStatus: "loaded",
      });
    }
    for (const topic of topicResult.data ?? []) {
      const chapter = topic.chapters;
      const current = chapters.get(chapter.id) ?? {
        ...chapter,
        topicsCount: 0,
        completedTopicsCount: 0,
        firstIncompleteTopicId: null,
        firstIncompleteTopicSlug: null,
        topics: [],
        topicsStatus: "loaded" as const,
      };
      current.topics.push({
        id: topic.id,
        slug: topic.slug,
        title: topic.title,
        completed: topic.completed,
        position: topic.position,
        content: EMPTY_RICH_TEXT,
        contentLoaded: false,
      });
      current.topicsCount = current.topics.length;
      current.completedTopicsCount = current.topics.filter(
        (item) => item.completed,
      ).length;
      const firstIncomplete = current.topics.find((item) => !item.completed);
      current.firstIncompleteTopicId = firstIncomplete?.id ?? null;
      current.firstIncompleteTopicSlug = firstIncomplete?.slug ?? null;
      chapters.set(chapter.id, current);
    }
    return [...chapters.values()].sort(
      (first, second) => first.position - second.position,
    );
  }

  async getLearningSummary() {
    const { data, error } = await this.client.rpc("get_learning_summary", {
      target_module_id: this.moduleId,
    });
    throwIfPostgrestError(error);
    if (!data) throw new Error("Nie udało się pobrać podsumowania nauki.");
    return data as unknown as LearningSummary;
  }

  async importDocx(draft: ContentModuleImportDraft) {
    const { data, error } = await this.client.rpc("import_docx_into_module", {
      target_module_id: this.moduleId,
      imported_chapters: createContentImportPayload(draft) as unknown as Json,
    });
    throwIfPostgrestError(error);
    this.clearStatisticsCache();
    return data ?? 0;
  }

  async createChapterWithTopics(chapter: ChapterSummary, topics: Topic[]) {
    const { error } = await this.client.rpc("create_chapter_with_topics", {
      target_module_id: this.moduleId,
      new_chapter: {
        id: chapter.id,
        slug: chapter.slug,
        title: chapter.title,
        position: chapter.position,
      },
      new_topics: topics.map((topic) => ({
        id: topic.id,
        slug: topic.slug,
        title: topic.title,
        content: topic.content as Json,
        completed: topic.completed,
        position: topic.position,
      })),
    });
    throwIfPostgrestError(error);
    this.clearStatisticsCache();
  }

  async updateChapter(chapterId: string, update: ChapterUpdate) {
    const { error } = await this.client
      .from("chapters")
      .update(update)
      .eq("id", chapterId)
      .eq("user_id", this.userId)
      .select("id")
      .single();
    throwIfPostgrestError(error);
  }

  async deleteChapter(chapterId: string) {
    const { error } = await this.client.rpc("move_to_trash", {
      target_type: "chapter",
      target_id: chapterId,
    });
    throwIfPostgrestError(error);
    this.clearStatisticsCache();
  }

  async createTopics(chapterId: string, topics: Topic[]) {
    const { error } = await this.client.from("topics").insert(
      topics.map((topic) => ({
        id: topic.id,
        slug: topic.slug,
        title: topic.title,
        content: topic.content as Json,
        completed: topic.completed,
        position: topic.position,
        chapter_id: chapterId,
        user_id: this.userId,
      })),
    );
    throwIfPostgrestError(error);
    this.clearStatisticsCache();
  }

  async updateTopic(chapterId: string, topicId: string, update: TopicUpdate) {
    const { error } = await this.client
      .from("topics")
      .update(update)
      .eq("id", topicId)
      .eq("chapter_id", chapterId)
      .eq("user_id", this.userId)
      .select("id")
      .single();
    throwIfPostgrestError(error);
    if ("completed" in update) {
      this.clearStatisticsCache();
    }
  }

  async updateTopicContent(
    chapterId: string,
    topicId: string,
    content: NoteContent,
    expectedContent: NoteContent,
  ) {
    const { data, error } = await this.client.rpc("save_topic_content", {
      target_chapter_id: chapterId,
      target_topic_id: topicId,
      new_content: content as Json,
      expected_content: expectedContent as Json,
    });
    throwIfPostgrestError(error);
    if (!data) throw new NoteContentConflictError();
  }

  async deleteTopic(chapterId: string, topicId: string) {
    void chapterId;
    const { error } = await this.client.rpc("move_to_trash", {
      target_type: "topic",
      target_id: topicId,
    });
    throwIfPostgrestError(error);
    this.clearStatisticsCache();
  }

  async deleteItems(chapterIds: string[], topicIds: string[]) {
    const { error } = await this.client.rpc("move_notes_to_trash", {
      chapter_ids: chapterIds,
      topic_ids: topicIds,
    });
    throwIfPostgrestError(error);
    this.clearStatisticsCache();
  }

  async setChapterCompleted(chapterId: string, completed: boolean) {
    const { error } = await this.client
      .from("topics")
      .update({ completed })
      .eq("chapter_id", chapterId)
      .eq("user_id", this.userId);
    throwIfPostgrestError(error);
    this.clearStatisticsCache();
  }

  async reorderChapters(chapterIds: string[]) {
    const { error } = await this.client.rpc("reorder_chapters", {
      chapter_ids: chapterIds,
    });
    throwIfPostgrestError(error);
  }

  async reorderTopics(chapterId: string, topicIds: string[]) {
    const { error } = await this.client.rpc("reorder_topics", {
      target_chapter_id: chapterId,
      topic_ids: topicIds,
    });
    throwIfPostgrestError(error);
  }

  async moveTopic(
    topicId: string,
    sourceChapterId: string,
    targetChapterId: string,
    targetSlug: string,
    sourceTopicIds: string[],
    targetTopicIds: string[],
  ) {
    const { error } = await this.client.rpc("move_topic", {
      moved_topic_id: topicId,
      source_chapter_id: sourceChapterId,
      source_topic_ids: sourceTopicIds,
      target_chapter_id: targetChapterId,
      target_slug: targetSlug,
      target_topic_ids: targetTopicIds,
    });
    throwIfPostgrestError(error);
    this.clearStatisticsCache();
  }
}
