import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/database.types";
import type {
  ChapterUpdate,
  NotesRepository,
  TopicUpdate,
} from "./notes-repository";
import type { ChapterSummary, NoteContent, Topic } from "../model/types";
import { EMPTY_RICH_TEXT } from "../model/rich-text-content";
import { throwIfPostgrestError } from "./supabase-error";
import { createTopicNavigation } from "../lib/topic-navigation";

export class SupabaseNotesRepository implements NotesRepository {
  private readonly client: SupabaseClient<Database>;
  private readonly userId: string;
  private readonly moduleId: string;

  constructor(
    client: SupabaseClient<Database>,
    userId: string,
    moduleId: string,
  ) {
    this.client = client;
    this.userId = userId;
    this.moduleId = moduleId;
  }

  async listChapters() {
    const { data, error } = await this.client
      .from("chapters")
      .select("id,slug,title,position,topics(id,slug,completed,position)")
      .eq("user_id", this.userId)
      .eq("module_id", this.moduleId)
      .is("trash_id", null)
      .is("topics.trash_id", null)
      .order("position")
      .order("id");
    throwIfPostgrestError(error);
    return (data ?? []).map((chapter) => {
      const topics = [...chapter.topics].sort(
        (a, b) => a.position - b.position,
      );
      const firstIncomplete = topics.find((topic) => !topic.completed);
      return {
        id: chapter.id,
        slug: chapter.slug,
        title: chapter.title,
        position: chapter.position,
        topicsCount: topics.length,
        completedTopicsCount: topics.filter((topic) => topic.completed).length,
        firstIncompleteTopicId: firstIncomplete?.id ?? null,
        firstIncompleteTopicSlug: firstIncomplete?.slug ?? null,
        topics: [],
        topicsStatus: "idle" as const,
      };
    });
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

  async getTopicNavigation(topicId: string) {
    const { data, error } = await this.client
      .from("topics")
      .select(
        "id,slug,title,position,chapter_id,chapters!inner(id,slug,title,position,module_id)",
      )
      .eq("user_id", this.userId)
      .eq("chapters.module_id", this.moduleId)
      .is("trash_id", null)
      .is("chapters.trash_id", null);
    throwIfPostgrestError(error);
    const topics = (data ?? []).sort(
      (first, second) =>
        first.chapters.position - second.chapters.position ||
        first.position - second.position,
    );
    return createTopicNavigation(
      topics.map((topic) => ({
        chapterId: topic.chapter_id,
        chapterSlug: topic.chapters.slug,
        chapterTitle: topic.chapters.title,
        topicId: topic.id,
        topicSlug: topic.slug,
        topicTitle: topic.title,
      })),
      topicId,
    );
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
        .eq("user_id", this.userId)
        .eq("chapters.module_id", this.moduleId)
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
    const chapters = await this.listChapters();
    const totalTopics = chapters.reduce(
      (sum, chapter) => sum + chapter.topicsCount,
      0,
    );
    const completedTopics = chapters.reduce(
      (sum, chapter) => sum + chapter.completedTopicsCount,
      0,
    );
    const nextChapter = chapters.find(
      (chapter) => chapter.firstIncompleteTopicId,
    );
    return {
      totalChapters: chapters.length,
      completedChapters: chapters.filter(
        (chapter) =>
          chapter.topicsCount > 0 &&
          chapter.topicsCount === chapter.completedTopicsCount,
      ).length,
      totalTopics,
      completedTopics,
      nextTopic: nextChapter?.firstIncompleteTopicId
        ? { chapterId: nextChapter.id, id: nextChapter.firstIncompleteTopicId }
        : null,
    };
  }

  async createChapters(chapters: ChapterSummary[]) {
    const { error } = await this.client.from("chapters").insert(
      chapters.map((chapter) => ({
        id: chapter.id,
        slug: chapter.slug,
        title: chapter.title,
        position: chapter.position,
        module_id: this.moduleId,
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
    const { error } = await this.client.rpc("move_to_trash", {
      target_type: "chapter",
      target_id: chapterId,
    });
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
    void chapterId;
    const { error } = await this.client.rpc("move_to_trash", {
      target_type: "topic",
      target_id: topicId,
    });
    throwIfPostgrestError(error);
  }

  async deleteItems(chapterIds: string[], topicIds: string[]) {
    const { error } = await this.client.rpc("move_notes_to_trash", {
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
    const results = await Promise.all(
      chapterIds.map((id, index) =>
        this.client
          .from("chapters")
          .update({ position: (index + 1) * 1000 })
          .eq("id", id)
          .eq("user_id", this.userId)
          .eq("module_id", this.moduleId),
      ),
    );
    for (const result of results) throwIfPostgrestError(result.error);
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
