import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { throwIfPostgrestError } from "@/features/notes/data/supabase-error";
import type { Module, ModulesRepository } from "./modules-repository";
import { clearMemoryCacheByPrefix } from "@/lib/memory-cache";

export class SupabaseModulesRepository implements ModulesRepository {
  private readonly client: SupabaseClient<Database>;
  private readonly userId: string;

  private clearStatisticsCache() {
    clearMemoryCacheByPrefix(`statistics:${this.userId}:`);
  }

  constructor(client: SupabaseClient<Database>, userId: string) {
    this.client = client;
    this.userId = userId;
  }

  private map(row: {
    id: string;
    name: string;
    module_position: number;
    chapters_count: number;
    completed_chapters_count: number;
    topics_count: number;
    completed_topics_count: number;
  }): Module {
    return {
      id: row.id,
      name: row.name,
      position: row.module_position,
      chaptersCount: row.chapters_count,
      completedChaptersCount: row.completed_chapters_count,
      topicsCount: row.topics_count,
      completedTopicsCount: row.completed_topics_count,
    };
  }

  async list() {
    const { data, error } = await this.client.rpc("get_module_summaries");
    throwIfPostgrestError(error);
    return (data ?? []).map((row) => this.map(row));
  }

  async get(id: string) {
    const { data, error } = await this.client.rpc("get_module_summaries", {
      target_module_id: id,
    });
    throwIfPostgrestError(error);
    return data?.[0] ? this.map(data[0]) : null;
  }

  async create(name: string, position: number) {
    const { data, error } = await this.client
      .from("modules")
      .insert({ user_id: this.userId, name, position })
      .select("id,name,position")
      .single();
    throwIfPostgrestError(error);
    if (!data) throw new Error("Nie udało się utworzyć modułu.");
    this.clearStatisticsCache();
    return {
      ...data,
      chaptersCount: 0,
      completedChaptersCount: 0,
      topicsCount: 0,
      completedTopicsCount: 0,
    };
  }

  async rename(id: string, name: string) {
    const { error } = await this.client
      .from("modules")
      .update({ name })
      .eq("id", id)
      .eq("user_id", this.userId)
      .select("id")
      .single();
    throwIfPostgrestError(error);
    this.clearStatisticsCache();
  }

  async remove(id: string) {
    const { error } = await this.client.rpc("move_to_trash", {
      target_type: "module",
      target_id: id,
    });
    throwIfPostgrestError(error);
    this.clearStatisticsCache();
  }

  async reorder(ids: string[]) {
    const { error } = await this.client.rpc("reorder_modules", {
      module_ids: ids,
    });
    throwIfPostgrestError(error);
  }

  async moveChapter(chapterId: string, moduleId: string) {
    const { error } = await this.client
      .from("chapters")
      .update({ module_id: moduleId })
      .eq("id", chapterId)
      .eq("user_id", this.userId)
      .select("id")
      .single();
    throwIfPostgrestError(error);
    this.clearStatisticsCache();
  }
}
