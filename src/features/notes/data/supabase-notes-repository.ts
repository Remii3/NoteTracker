import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/database.types";
import type {
  ChapterUpdate,
  NotesRepository,
  TopicUpdate,
} from "./notes-repository";
import type {
  ChapterSummary,
  LearningSummary,
  NoteContent,
  Topic,
  TopicNavigation,
} from "../model/types";
import { EMPTY_RICH_TEXT } from "../model/rich-text-content";
import { throwIfPostgrestError } from "./supabase-error";

export class SupabaseNotesRepository implements NotesRepository {
  private readonly client: SupabaseClient<Database>;
  private readonly userId: string;

  constructor(client: SupabaseClient<Database>, userId: string) {
    this.client = client;
    this.userId = userId;
  }

  async listChapters() {
    const { data, error } = await this.client.rpc("get_chapter_summaries");
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
      .single();
    throwIfPostgrestError(error);
    if (!data) throw new Error("Nie znaleziono notatki.");
    return data.content as NoteContent;
  }

  async getTopicNavigation(topicId: string) {
    const { data, error } = await this.client.rpc("get_topic_navigation", {
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
        .ilike("title", pattern)
        .order("position")
        .limit(limit),
      this.client
        .from("topics")
        .select(
          "id,slug,title,completed,position,chapter_id,chapters!inner(id,slug,title,position)",
        )
        .ilike("title", pattern)
        .order("position")
        .limit(limit),
    ]);
    throwIfPostgrestError(chapterResult.error);
    throwIfPostgrestError(topicResult.error);

    const chapters = new Map<string, import("../model/types").Chapter>();
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
    const { data, error } = await this.client.rpc("get_learning_summary");
    throwIfPostgrestError(error);
    return data as LearningSummary;
  }

  async createChapters(chapters: ChapterSummary[]) {
    const { error } = await this.client.from("chapters").insert(
      chapters.map((chapter) => ({
        id: chapter.id,
        slug: chapter.slug,
        title: chapter.title,
        position: chapter.position,
        user_id: this.userId,
      })),
    );
    throwIfPostgrestError(error);
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
    const { error } = await this.client
      .from("chapters")
      .delete()
      .eq("id", chapterId)
      .eq("user_id", this.userId)
      .select("id")
      .single();
    throwIfPostgrestError(error);
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
  }

  async updateTopicContent(
    chapterId: string,
    topicId: string,
    content: NoteContent,
  ) {
    const { error } = await this.client
      .from("topics")
      .update({ content: content as Json })
      .eq("id", topicId)
      .eq("chapter_id", chapterId)
      .eq("user_id", this.userId)
      .select("id")
      .single();
    throwIfPostgrestError(error);
  }

  async deleteTopic(chapterId: string, topicId: string) {
    const { error } = await this.client
      .from("topics")
      .delete()
      .eq("id", topicId)
      .eq("chapter_id", chapterId)
      .eq("user_id", this.userId)
      .select("id")
      .single();
    throwIfPostgrestError(error);
  }

  async deleteItems(chapterIds: string[], topicIds: string[]) {
    const { error } = await this.client.rpc("delete_notes_bulk", {
      chapter_ids: chapterIds,
      topic_ids: topicIds,
    });
    throwIfPostgrestError(error);
  }

  async setChapterCompleted(chapterId: string, completed: boolean) {
    const { error } = await this.client
      .from("topics")
      .update({ completed })
      .eq("chapter_id", chapterId)
      .eq("user_id", this.userId);
    throwIfPostgrestError(error);
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
  }
}
