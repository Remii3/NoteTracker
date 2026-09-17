import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { throwIfPostgrestError } from "@/features/notes/data/supabase-error";
import type { TodayRepository } from "./today-repository";
import type { TodayDashboard } from "../model/types";
import { SupabaseExamPlansRepository } from "@/features/exam-plans/data/supabase-exam-plans-repository";

export class SupabaseTodayRepository implements TodayRepository {
  private readonly client: SupabaseClient<Database>;
  private readonly userId: string;

  constructor(client: SupabaseClient<Database>, userId: string) {
    this.client = client;
    this.userId = userId;
  }

  async get(timezone: string) {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    await new SupabaseExamPlansRepository(
      this.client,
      this.userId,
    ).rebuildAdaptivePlans(today);
    const [dashboard, assignments] = await Promise.all([
      this.client.rpc("get_today_dashboard", {
        timezone_name: timezone,
      }),
      this.client
        .from("exam_plan_assignments")
        .select("topic_id,position")
        .eq("user_id", this.userId)
        .eq("scheduled_for", today)
        .is("completed_at", null)
        .order("position"),
    ]);
    throwIfPostgrestError(dashboard.error);
    throwIfPostgrestError(assignments.error);
    const result = dashboard.data as unknown as TodayDashboard;
    const topicIds = [
      ...new Set((assignments.data ?? []).map((item) => item.topic_id)),
    ];
    if (!topicIds.length) return result;

    const [topics, deferrals] = await Promise.all([
      this.client
        .from("topics")
        .select(
          "id,title,slug,chapter_id,chapters!inner(title,slug,module_id,modules!inner(name,slug))",
        )
        .eq("user_id", this.userId)
        .in("id", topicIds)
        .eq("completed", false)
        .is("trash_id", null)
        .is("chapters.trash_id", null)
        .is("chapters.modules.trash_id", null),
      this.client
        .from("study_task_deferrals")
        .select("task_id")
        .eq("user_id", this.userId)
        .eq("task_type", "topic")
        .gt("deferred_until", today)
        .in("task_id", topicIds),
    ]);
    throwIfPostgrestError(topics.error);
    throwIfPostgrestError(deferrals.error);
    const deferredIds = new Set(
      (deferrals.data ?? []).map((deferral) => deferral.task_id),
    );
    const byId = new Map(
      (topics.data ?? []).map((topic) => [
        topic.id,
        {
          id: topic.id,
          title: topic.title,
          topicSlug: topic.slug,
          chapterTitle: topic.chapters.title,
          chapterSlug: topic.chapters.slug,
          moduleId: topic.chapters.module_id,
          moduleName: topic.chapters.modules.name,
          moduleSlug: topic.chapters.modules.slug,
        },
      ]),
    );
    const scheduled = topicIds.flatMap((id) => {
      const topic = byId.get(id);
      return topic && !deferredIds.has(id) ? [topic] : [];
    });
    const scheduledIds = new Set(scheduled.map((topic) => topic.id));
    return {
      ...result,
      recommendedTopics: [
        ...scheduled,
        ...result.recommendedTopics.filter(
          (topic) => !scheduledIds.has(topic.id),
        ),
      ].slice(0, 8),
    };
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

  async createQuickSession(moduleId: string, timezone: string) {
    const { data, error } = await this.client.rpc("create_fsrs_study_session", {
      target_module_id: moduleId,
      requested_question_count: 10,
      timezone_name: timezone,
    });
    throwIfPostgrestError(error);
    if (!data) throw new Error("Nie udało się utworzyć sesji.");
    return data;
  }
}
