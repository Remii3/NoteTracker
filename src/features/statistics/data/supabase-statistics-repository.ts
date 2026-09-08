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
    const [study, progress] = await Promise.all([
      this.client.rpc("get_study_statistics", {
        target_module_id: options.moduleId,
        range_days: options.range,
        study_mode: options.mode === "all" ? null : options.mode,
        timezone_name: options.timezone,
      }),
      this.client.rpc("get_progress_statistics", {
        target_module_id: options.moduleId,
        range_days: options.range,
        timezone_name: options.timezone,
      }),
    ]);
    throwIfPostgrestError(study.error);
    throwIfPostgrestError(progress.error);
    return {
      ...(study.data as unknown as Omit<StudyStatistics, "progress">),
      progress: progress.data,
    } as unknown as StudyStatistics;
  }

  async saveWeeklyGoal(topics: number) {
    const { error } = await this.client.from("study_goals").upsert(
      {
        user_id: this.userId,
        weekly_topics: topics,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    throwIfPostgrestError(error);
  }
}
