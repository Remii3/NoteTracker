import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/database.types";
import { throwIfPostgrestError } from "@/features/notes/data/supabase-error";
import type { Module, ModulesRepository } from "./modules-repository";
import { clearMemoryCacheByPrefix } from "@/lib/memory-cache";
import type { ImportedModuleDraft } from "../import/docx-import";
import { createUniqueSlug } from "@/features/notes/lib/slug-utils";
import { toModuleNameSearchPattern } from "../lib/module-search";

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
    is_pinned: boolean;
    slug: string;
    name: string;
    module_position: number;
    chapters_count: number;
    completed_chapters_count: number;
    topics_count: number;
    completed_topics_count: number;
  }): Module {
    return {
      id: row.id,
      isPinned: row.is_pinned,
      slug: row.slug,
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

  async listPinned() {
    const { data, error } = await this.client
      .rpc("get_module_summaries")
      .eq("is_pinned", true)
      .order("name", { ascending: true })
      .order("id", { ascending: true });
    throwIfPostgrestError(error);
    return (data ?? []).map((row) => this.map(row));
  }

  async listPage(query: string, offset: number, limit: number) {
    let request = this.client
      .rpc("get_module_summaries")
      .eq("is_pinned", false)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + limit);
    const phrase = query.trim();
    if (phrase)
      request = request.ilike("name", toModuleNameSearchPattern(phrase));

    const { data, error } = await request;
    throwIfPostgrestError(error);
    const rows = data ?? [];
    return {
      modules: rows.slice(0, limit).map((row) => this.map(row)),
      hasMore: rows.length > limit,
    };
  }

  async get(id: string) {
    const { data, error } = await this.client.rpc("get_module_summaries", {
      target_module_id: id,
    });
    throwIfPostgrestError(error);
    return data?.[0] ? this.map(data[0]) : null;
  }

  async getBySlug(slug: string) {
    const { data, error } = await this.client.rpc("get_module_summaries", {
      target_module_slug: slug,
    });
    throwIfPostgrestError(error);
    return data?.[0] ? this.map(data[0]) : null;
  }

  async create(name: string, position: number) {
    const { data, error } = await this.client
      .from("modules")
      .insert({ user_id: this.userId, name, position })
      .select("id,name,slug,position")
      .single();
    throwIfPostgrestError(error);
    if (!data) throw new Error("Nie udało się utworzyć modułu.");
    this.clearStatisticsCache();
    return {
      ...data,
      isPinned: false,
      chaptersCount: 0,
      completedChaptersCount: 0,
      topicsCount: 0,
      completedTopicsCount: 0,
    };
  }

  async importDocx(draft: ImportedModuleDraft, position: number) {
    const chapterSlugs = new Set<string>();
    const chapters = draft.chapters.map((chapter, chapterIndex) => {
      const chapterSlug = createUniqueSlug(
        chapter.title,
        chapterSlugs,
        "rozdzial",
      );
      chapterSlugs.add(chapterSlug);
      const topicSlugs = new Set<string>();
      return {
        title: chapter.title,
        slug: chapterSlug,
        position: (chapterIndex + 1) * 1000,
        topics: chapter.topics.map((topic, topicIndex) => {
          const slug = createUniqueSlug(topic.title, topicSlugs, "temat");
          topicSlugs.add(slug);
          return {
            title: topic.title,
            slug,
            position: (topicIndex + 1) * 1000,
            content: topic.content,
          };
        }),
      };
    });
    const { data, error } = await this.client.rpc("import_docx_module", {
      target_name: draft.name,
      target_position: position,
      imported_chapters: chapters as unknown as Json,
    });
    throwIfPostgrestError(error);
    if (!data) throw new Error("Nie udało się zaimportować modułu.");
    this.clearStatisticsCache();
    const imported = await this.get(data);
    if (!imported)
      throw new Error("Nie udało się odczytać modułu po imporcie.");
    return imported;
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

  async setPinned(id: string, isPinned: boolean) {
    const { error } = await this.client
      .from("modules")
      .update({ is_pinned: isPinned })
      .eq("id", id)
      .eq("user_id", this.userId)
      .select("id")
      .single();
    throwIfPostgrestError(error);
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
