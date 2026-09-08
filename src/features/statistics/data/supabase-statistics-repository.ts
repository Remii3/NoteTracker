import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { throwIfPostgrestError } from "@/features/notes/data/supabase-error";
import type { StatisticsRepository } from "./statistics-repository";
import type { StudyStatistics } from "../model/types";

export class SupabaseStatisticsRepository implements StatisticsRepository {
  private readonly client: SupabaseClient<Database>;
  private readonly userId: string;

  constructor(client: SupabaseClient<Database>, userId: string) {
    this.client = client;
    this.userId = userId;
  }

  async get(options: Parameters<StatisticsRepository["get"]>[0]) {
    const { data, error } = await this.client.rpc("get_study_statistics", {
      target_module_id: options.moduleId,
      range_days: options.range,
      study_mode: options.mode === "all" ? null : options.mode,
      timezone_name: options.timezone,
    });
    throwIfPostgrestError(error);
    return data as unknown as StudyStatistics;
  }

  async saveWeeklyGoal(minutes: number) {
    const { error } = await this.client.from("study_goals").upsert(
      {
        user_id: this.userId,
        weekly_minutes: minutes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    throwIfPostgrestError(error);
  }
}
