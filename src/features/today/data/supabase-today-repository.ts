import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { throwIfPostgrestError } from "@/features/notes/data/supabase-error";
import type { TodayRepository } from "./today-repository";
import type { TodayDashboard } from "../model/types";

export class SupabaseTodayRepository implements TodayRepository {
  private readonly client: SupabaseClient<Database>;
  private readonly userId: string;

  constructor(client: SupabaseClient<Database>, userId: string) {
    this.client = client;
    this.userId = userId;
  }

  async get(timezone: string) {
    const { data, error } = await this.client.rpc("get_today_dashboard", {
      timezone_name: timezone,
    });
    throwIfPostgrestError(error);
    return data as unknown as TodayDashboard;
  }

  async deferTask(input: Parameters<TodayRepository["deferTask"]>[0]) {
    const { error } = await this.client.from("study_task_deferrals").upsert(
      {
        user_id: this.userId,
        task_type: input.taskType,
        task_id: input.taskId,
        deferred_until: input.until,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,task_type,task_id" },
    );
    throwIfPostgrestError(error);
  }

  async setExamDate(moduleId: string, examDate: string | null) {
    const { error } = await this.client
      .from("modules")
      .update({ exam_date: examDate })
      .eq("id", moduleId)
      .eq("user_id", this.userId)
      .is("trash_id", null)
      .select("id")
      .single();
    throwIfPostgrestError(error);
  }

  async createQuickSession(moduleId: string) {
    const { data, error } = await this.client.rpc("create_study_session", {
      target_module_id: moduleId,
      study_mode: "flashcards",
      scope_mode: "all",
      selected_chapter_id: null,
      selected_topic_id: null,
      random_chapter_count: 3,
      requested_question_count: 10,
    });
    throwIfPostgrestError(error);
    if (!data) throw new Error("Nie udało się utworzyć sesji.");
    return data;
  }
}
