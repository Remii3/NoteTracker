import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/database.types";
import type {
  ChapterUpdate,
  NotesRepository,
  TopicUpdate,
} from "./notes-repository";
import type { ChapterSummary, NoteContent, Topic } from "../model/types";

type ChapterRow = {
  id: string;
  slug: string;
  title: string;
  position: number;
};

type TopicRow = {
  id: string;
  slug: string;
  title: string;
  content: NoteContent;
  completed: boolean;
  position: number;
};

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export class SupabaseNotesRepository implements NotesRepository {
  private readonly client: SupabaseClient<Database>;
  private readonly userId: string;

  constructor(client: SupabaseClient<Database>, userId: string) {
    this.client = client;
    this.userId = userId;
  }

  async listChapters(): Promise<ChapterSummary[]> {
    const { data, error } = await this.client
      .from("chapters")
      .select("id,slug,title,position")
      .order("position")
      .order("id");
    throwIfError(error);
    return (data ?? []) as ChapterRow[];
  }

  async listTopics(chapterId: string): Promise<Topic[]> {
    const { data, error } = await this.client
      .from("topics")
      .select("id,slug,title,content,completed,position")
      .eq("chapter_id", chapterId)
      .order("position")
      .order("id");
    throwIfError(error);
    return (data ?? []) as TopicRow[];
  }

  async createChapter(chapter: ChapterSummary) {
    const { error } = await this.client.from("chapters").insert({
      id: chapter.id,
      slug: chapter.slug,
      title: chapter.title,
      position: chapter.position,
      user_id: this.userId,
    });
    throwIfError(error);
  }

  async updateChapter(chapterId: string, update: ChapterUpdate) {
    const { error } = await this.client
      .from("chapters")
      .update(update)
      .eq("id", chapterId)
      .eq("user_id", this.userId)
      .select("id")
      .single();
    throwIfError(error);
  }

  async deleteChapter(chapterId: string) {
    const { error } = await this.client
      .from("chapters")
      .delete()
      .eq("id", chapterId)
      .eq("user_id", this.userId)
      .select("id")
      .single();
    throwIfError(error);
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
    throwIfError(error);
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
    throwIfError(error);
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
    throwIfError(error);
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
    throwIfError(error);
  }

  async setChapterCompleted(chapterId: string, completed: boolean) {
    const { error } = await this.client
      .from("topics")
      .update({ completed })
      .eq("chapter_id", chapterId)
      .eq("user_id", this.userId);
    throwIfError(error);
  }

  async reorderChapters(chapterIds: string[]) {
    await Promise.all(
      chapterIds.map((chapterId, index) =>
        this.updateChapter(chapterId, { position: (index + 1) * 1000 }),
      ),
    );
  }

  async reorderTopics(chapterId: string, topicIds: string[]) {
    await Promise.all(
      topicIds.map((topicId, index) =>
        this.updateTopic(chapterId, topicId, {
          position: (index + 1) * 1000,
        }),
      ),
    );
  }

  async moveTopic(
    topicId: string,
    sourceChapterId: string,
    targetChapterId: string,
    targetSlug: string,
    sourceTopicIds: string[],
    targetTopicIds: string[],
  ) {
    const targetPosition =
      (Math.max(0, targetTopicIds.indexOf(topicId)) + 1) * 1000;
    const { error } = await this.client
      .from("topics")
      .update({
        chapter_id: targetChapterId,
        position: targetPosition,
        slug: targetSlug,
      })
      .eq("id", topicId)
      .eq("chapter_id", sourceChapterId)
      .eq("user_id", this.userId)
      .select("id")
      .single();
    throwIfError(error);
    await Promise.all([
      this.reorderTopics(sourceChapterId, sourceTopicIds),
      this.reorderTopics(targetChapterId, targetTopicIds),
    ]);
  }
}
