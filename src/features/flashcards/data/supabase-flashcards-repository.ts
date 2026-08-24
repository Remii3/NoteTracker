import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { throwIfPostgrestError } from "@/features/notes/data/supabase-error";
import type { FlashcardsRepository } from "./flashcards-repository";
import type { FlashcardResult } from "../model/types";

export class SupabaseFlashcardsRepository implements FlashcardsRepository {
  private readonly client: SupabaseClient<Database>;
  private readonly userId: string;

  constructor(client: SupabaseClient<Database>, userId: string) {
    this.client = client;
    this.userId = userId;
  }

  async listForTopic(topicId: string) {
    const { data, error } = await this.client
      .from("flashcards")
      .select("id,topic_id,question,answer")
      .eq("topic_id", topicId)
      .eq("user_id", this.userId)
      .order("created_at");
    throwIfPostgrestError(error);
    return (data ?? []).map((item) => ({
      id: item.id,
      topicId: item.topic_id,
      question: item.question,
      answer: item.answer,
    }));
  }

  async create(topicId: string, question: string, answer: string) {
    const { data, error } = await this.client
      .from("flashcards")
      .insert({ topic_id: topicId, user_id: this.userId, question, answer })
      .select("id,topic_id,question,answer")
      .single();
    throwIfPostgrestError(error);
    if (!data) throw new Error("Nie udało się utworzyć fiszki.");
    return {
      id: data.id,
      topicId: data.topic_id,
      question: data.question,
      answer: data.answer,
    };
  }

  async update(id: string, question: string, answer: string) {
    const { error } = await this.client
      .from("flashcards")
      .update({ question, answer, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", this.userId)
      .select("id")
      .single();
    throwIfPostgrestError(error);
  }

  async remove(id: string) {
    const { error } = await this.client
      .from("flashcards")
      .delete()
      .eq("id", id)
      .eq("user_id", this.userId)
      .select("id")
      .single();
    throwIfPostgrestError(error);
  }

  async createSession(
    options: Parameters<FlashcardsRepository["createSession"]>[0],
  ) {
    const { data, error } = await this.client.rpc("create_flashcard_session", {
      session_mode: options.mode,
      selected_chapter_id: options.chapterId ?? null,
      random_chapter_count: options.randomChapterCount,
      requested_card_count: options.cardCount,
    });
    throwIfPostgrestError(error);
    if (!data) throw new Error("Nie udało się utworzyć sesji.");
    return data;
  }

  async getSession(id: string) {
    const [sessionResult, itemsResult] = await Promise.all([
      this.client
        .from("flashcard_sessions")
        .select("id,status")
        .eq("id", id)
        .eq("user_id", this.userId)
        .single(),
      this.client
        .from("flashcard_session_items")
        .select("id,position,question_snapshot,answer_snapshot,result")
        .eq("session_id", id)
        .eq("user_id", this.userId)
        .order("position"),
    ]);
    throwIfPostgrestError(sessionResult.error);
    throwIfPostgrestError(itemsResult.error);
    if (!sessionResult.data) throw new Error("Nie znaleziono sesji.");
    return {
      id: sessionResult.data.id,
      status: sessionResult.data.status,
      items: (itemsResult.data ?? []).map((item) => ({
        id: item.id,
        position: item.position,
        question: item.question_snapshot,
        answer: item.answer_snapshot,
        result: item.result,
      })),
    };
  }

  async answerItem(id: string, result: FlashcardResult) {
    const { error } = await this.client
      .from("flashcard_session_items")
      .update({ result, answered_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", this.userId)
      .select("id")
      .single();
    throwIfPostgrestError(error);
  }

  async completeSession(id: string) {
    const { error } = await this.client
      .from("flashcard_sessions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", this.userId)
      .select("id")
      .single();
    throwIfPostgrestError(error);
  }

  async retrySession(id: string) {
    const { data, error } = await this.client.rpc("retry_flashcard_session", {
      source_session_id: id,
    });
    throwIfPostgrestError(error);
    if (!data) throw new Error("Nie udało się utworzyć powtórki.");
    return data;
  }
}
