import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { throwIfPostgrestError } from "@/features/notes/data/supabase-error";
import type { Module, ModulesRepository } from "./modules-repository";

export class SupabaseModulesRepository implements ModulesRepository {
  private readonly client: SupabaseClient<Database>;
  private readonly userId: string;

  constructor(client: SupabaseClient<Database>, userId: string) {
    this.client = client;
    this.userId = userId;
  }

  private map(row: {
    id: string;
    name: string;
    position: number;
    chapters: { count: number }[];
  }): Module {
    return {
      id: row.id,
      name: row.name,
      position: row.position,
      chaptersCount: row.chapters[0]?.count ?? 0,
    };
  }

  async list() {
    const { data, error } = await this.client
      .from("modules")
      .select("id,name,position,chapters(count)")
      .eq("user_id", this.userId)
      .order("position")
      .order("id");
    throwIfPostgrestError(error);
    return (data ?? []).map((row) => this.map(row));
  }

  async get(id: string) {
    const { data, error } = await this.client
      .from("modules")
      .select("id,name,position,chapters(count)")
      .eq("id", id)
      .eq("user_id", this.userId)
      .maybeSingle();
    throwIfPostgrestError(error);
    return data ? this.map(data) : null;
  }

  async create(name: string, position: number) {
    const { data, error } = await this.client
      .from("modules")
      .insert({ user_id: this.userId, name, position })
      .select("id,name,position")
      .single();
    throwIfPostgrestError(error);
    if (!data) throw new Error("Nie udało się utworzyć modułu.");
    return { ...data, chaptersCount: 0 };
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
  }

  async remove(id: string) {
    const { error } = await this.client.rpc("delete_module_cascade", {
      target_module_id: id,
    });
    throwIfPostgrestError(error);
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
  }
}
