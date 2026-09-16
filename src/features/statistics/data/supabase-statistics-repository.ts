import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { throwIfPostgrestError } from "@/features/notes/data/supabase-error";
import type { StatisticsRepository } from "./statistics-repository";
import type {
  ProgressTopic,
  ProgressTopicCursor,
  ProgressStatistics,
  StudyStatistics,
} from "../model/types";

export class SupabaseStatisticsRepository implements StatisticsRepository {
  private readonly client: SupabaseClient<Database>;
  private readonly userId: string;

  constructor(client: SupabaseClient<Database>, userId: string) {
    this.client = client;
    this.userId = userId;
  }

  async get(options: Parameters<StatisticsRepository["get"]>[0]) {
    const [study, progress, goal] = await Promise.all([
      this.client.rpc("get_study_statistics", {
        target_module_id: options.moduleId,
        range_days: options.range,
        study_mode: options.mode === "all" ? null : options.mode,
        timezone_name: options.timezone,
      }),
      this.client.rpc("get_progress_overview_statistics", {
        target_module_id: options.moduleId,
        range_days: options.range,
        timezone_name: options.timezone,
      }),
      this.client
        .from("study_goals")
        .select("weekly_topics_enabled")
        .eq("user_id", this.userId)
        .maybeSingle(),
    ]);
    throwIfPostgrestError(study.error);
    throwIfPostgrestError(progress.error);
    throwIfPostgrestError(goal.error);
    const progressData = progress.data as unknown as ProgressStatistics;
    return {
      ...(study.data as unknown as Omit<StudyStatistics, "progress">),
      progress: {
        ...progressData,
        weeklyGoal: {
          ...progressData.weeklyGoal,
          enabled: goal.data?.weekly_topics_enabled ?? true,
        },
      },
    } as unknown as StudyStatistics;
  }

  async getTopicsPage(
    options: Parameters<StatisticsRepository["getTopicsPage"]>[0],
  ) {
    const pageSize = options.pageSize ?? 30;
    const cursor = options.cursor;
    const { data, error } = await this.client.rpc("get_progress_topics_page", {
      target_module_id: options.moduleId,
      sort_mode: options.sort,
      page_size: pageSize,
      after_sort_rank: cursor?.sortRank,
      after_chapter_position: cursor?.chapterPosition,
      after_topic_position: cursor?.topicPosition,
      after_topic_id: cursor?.topicId,
      completion_filter: options.filter,
    });
    throwIfPostgrestError(error);
    const rows = data ?? [];
    const visibleRows = rows.slice(0, pageSize);
    const items: ProgressTopic[] = visibleRows.map((row) => ({
      id: row.topic_id,
      chapterId: row.chapter_id,
      chapterTitle: row.chapter_title,
      title: row.title,
      completed: row.completed,
      firstCompletedAt: row.first_completed_at,
    }));
    const last = visibleRows.at(-1);
    const nextCursor: ProgressTopicCursor | null =
      rows.length > pageSize && last
        ? {
            sortRank: last.sort_rank,
            chapterPosition: last.chapter_position,
            topicPosition: last.topic_position,
            topicId: last.topic_id,
          }
        : null;
    return { items, nextCursor };
  }
}
