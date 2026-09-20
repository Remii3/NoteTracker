import type { Database, Json } from "@/lib/supabase/database.types";
import type {
  ExamCalendar,
  ExamPlan,
  ExamPlanDay,
  ExamPlanTopic,
  SaveExamPlanInput,
} from "../model/types";
import type {
  ExamPlanningChapterPage,
  ExamPlanningMaterial,
  ExamPlanningScope,
  ExamPlansRepository,
} from "./exam-plans-repository";

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateExamPlan } from "../domain/plan-generator";
import { throwIfPostgrestError } from "@/features/notes/data/supabase-error";

type PlanRow = Database["public"]["Tables"]["exam_plans"]["Row"];
type PlanTopicRow = Pick<
  Database["public"]["Tables"]["exam_plan_topics"]["Row"],
  "topic_id" | "workload_points" | "workload_source"
>;
type PlanAssignmentRow = Pick<
  Database["public"]["Tables"]["exam_plan_assignments"]["Row"],
  | "topic_id"
  | "scheduled_for"
  | "position"
  | "workload_points"
  | "is_locked"
  | "completed_at"
>;
type PlanDayRow =
  Database["public"]["Tables"]["exam_plan_daily_targets"]["Row"];

const adaptiveRebuilds = new Map<string, Promise<void>>();
const DATABASE_PAGE_SIZE = 1_000;

function localDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function mapPlan(row: PlanRow): ExamPlan {
  return {
    id: row.id,
    moduleId: row.module_id,
    name: row.name,
    examDate: row.exam_date,
    targetRetention: Number(row.target_retention),
    studyWeekdays: row.study_weekdays,
    dailyTimeLimitMinutes: row.daily_time_limit_minutes,
    dailyQuestionLimit: row.daily_question_limit,
    bufferPercent: row.buffer_percent,
    includeUnassignedQuestions: row.include_unassigned_questions,
    status: row.status,
    needsRebuild: row.needs_rebuild,
    planVersion: row.plan_version,
    lastRebuiltOn: row.last_rebuilt_on,
  };
}

function planningTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export class SupabaseExamPlansRepository implements ExamPlansRepository {
  private readonly client: SupabaseClient<Database>;
  private readonly userId: string;

  constructor(client: SupabaseClient<Database>, userId: string) {
    this.client = client;
    this.userId = userId;
  }

  private async listPlanTopics(planId: string) {
    const rows: PlanTopicRow[] = [];
    for (let from = 0; ; from += DATABASE_PAGE_SIZE) {
      const { data, error } = await this.client
        .from("exam_plan_topics")
        .select("topic_id,workload_points,workload_source")
        .eq("exam_plan_id", planId)
        .eq("user_id", this.userId)
        .order("topic_id")
        .range(from, from + DATABASE_PAGE_SIZE - 1);
      throwIfPostgrestError(error);
      const page = data ?? [];
      rows.push(...page);
      if (page.length < DATABASE_PAGE_SIZE) return rows;
    }
  }

  private async listPlanAssignments(planId: string) {
    const rows: PlanAssignmentRow[] = [];
    for (let from = 0; ; from += DATABASE_PAGE_SIZE) {
      const { data, error } = await this.client
        .from("exam_plan_assignments")
        .select(
          "topic_id,scheduled_for,position,workload_points,is_locked,completed_at",
        )
        .eq("exam_plan_id", planId)
        .eq("user_id", this.userId)
        .order("scheduled_for")
        .order("position")
        .order("topic_id")
        .range(from, from + DATABASE_PAGE_SIZE - 1);
      throwIfPostgrestError(error);
      const page = data ?? [];
      rows.push(...page);
      if (page.length < DATABASE_PAGE_SIZE) return rows;
    }
  }

  private async listPlanDays(planId: string) {
    const rows: PlanDayRow[] = [];
    for (let from = 0; ; from += DATABASE_PAGE_SIZE) {
      const { data, error } = await this.client
        .from("exam_plan_daily_targets")
        .select("*")
        .eq("exam_plan_id", planId)
        .eq("user_id", this.userId)
        .order("target_date")
        .range(from, from + DATABASE_PAGE_SIZE - 1);
      throwIfPostgrestError(error);
      const page = data ?? [];
      rows.push(...page);
      if (page.length < DATABASE_PAGE_SIZE) return rows;
    }
  }

  async list(moduleId?: string) {
    let query = this.client
      .from("exam_plans")
      .select("*")
      .eq("user_id", this.userId)
      .order("exam_date");
    if (moduleId) query = query.eq("module_id", moduleId);
    const { data, error } = await query;
    throwIfPostgrestError(error);
    return (data ?? []).map(mapPlan);
  }

  async getCalendar(fromDate: string): Promise<ExamCalendar> {
    await this.rebuildAdaptivePlans(fromDate);
    const plans = (await this.list()).filter(
      (plan) => plan.status === "active",
    );
    if (!plans.length) return { plans: [], days: [] };
    const planIds = plans.map((plan) => plan.id);
    const moduleIds = [...new Set(plans.map((plan) => plan.moduleId))];
    const [modulesResult, scopesResult, assignmentsResult, targetsResult] =
      await Promise.all([
        this.client
          .from("modules")
          .select("id,name,slug")
          .eq("user_id", this.userId)
          .in("id", moduleIds),
        this.client
          .from("exam_plan_topics")
          .select("exam_plan_id,topic_id")
          .eq("user_id", this.userId)
          .in("exam_plan_id", planIds),
        this.client
          .from("exam_plan_assignments")
          .select("exam_plan_id,topic_id,scheduled_for")
          .eq("user_id", this.userId)
          .in("exam_plan_id", planIds)
          .gte("scheduled_for", fromDate),
        this.client
          .from("exam_plan_daily_targets")
          .select(
            "exam_plan_id,target_date,review_forecast_low,review_forecast_high,is_overloaded",
          )
          .eq("user_id", this.userId)
          .in("exam_plan_id", planIds)
          .gte("target_date", fromDate)
          .order("target_date"),
      ]);
    throwIfPostgrestError(modulesResult.error);
    throwIfPostgrestError(scopesResult.error);
    throwIfPostgrestError(assignmentsResult.error);
    throwIfPostgrestError(targetsResult.error);

    const modules = new Map(
      (modulesResult.data ?? []).map((module) => [module.id, module]),
    );
    const scopes = new Map<string, Set<string>>();
    for (const row of scopesResult.data ?? []) {
      const scope = scopes.get(row.exam_plan_id) ?? new Set<string>();
      scope.add(row.topic_id);
      scopes.set(row.exam_plan_id, scope);
    }
    const assignmentsByDate = new Map<string, Set<string>>();
    for (const row of assignmentsResult.data ?? []) {
      const topics =
        assignmentsByDate.get(row.scheduled_for) ?? new Set<string>();
      topics.add(row.topic_id);
      assignmentsByDate.set(row.scheduled_for, topics);
    }
    const planById = new Map(plans.map((plan) => [plan.id, plan]));
    const targetsByDate = new Map<
      string,
      NonNullable<typeof targetsResult.data>
    >();
    for (const target of targetsResult.data ?? []) {
      const rows = targetsByDate.get(target.target_date) ?? [];
      rows.push(target);
      targetsByDate.set(target.target_date, rows);
    }

    const days = [...targetsByDate.entries()].map(([date, targets]) => {
      const seenTopics = new Set<string>();
      let reviewForecastLow = 0;
      let reviewForecastHigh = 0;
      const ordered = [...targets].sort((first, second) =>
        (planById.get(first.exam_plan_id)?.examDate ?? "").localeCompare(
          planById.get(second.exam_plan_id)?.examDate ?? "",
        ),
      );
      for (const target of ordered) {
        const scope = scopes.get(target.exam_plan_id) ?? new Set<string>();
        const uniqueCount = [...scope].filter(
          (topicId) => !seenTopics.has(topicId),
        ).length;
        const uniqueRatio = scope.size ? uniqueCount / scope.size : 1;
        reviewForecastLow += Math.round(
          target.review_forecast_low * uniqueRatio,
        );
        reviewForecastHigh += Math.round(
          target.review_forecast_high * uniqueRatio,
        );
        scope.forEach((topicId) => seenTopics.add(topicId));
      }
      return {
        date,
        topicIds: [...(assignmentsByDate.get(date) ?? [])],
        reviewForecastLow,
        reviewForecastHigh,
        isOverloaded: targets.some((target) => target.is_overloaded),
        planIds: targets.map((target) => target.exam_plan_id),
      };
    });

    return {
      plans: plans.flatMap((plan) => {
        const module = modules.get(plan.moduleId);
        return module
          ? [{ ...plan, moduleName: module.name, moduleSlug: module.slug }]
          : [];
      }),
      days,
    };
  }

  async get(planId: string) {
    const planResult = await this.client
      .from("exam_plans")
      .select("*")
      .eq("id", planId)
      .eq("user_id", this.userId)
      .single();
    throwIfPostgrestError(planResult.error);
    if (!planResult.data) throw new Error("Nie znaleziono planu egzaminu.");

    const [topicResult, assignmentResult, dayResult, material] =
      await Promise.all([
        this.listPlanTopics(planId),
        this.listPlanAssignments(planId),
        this.listPlanDays(planId),
        this.getPlanningMaterial(planResult.data.module_id),
      ]);

    const assignmentsByDate = new Map<string, ExamPlanDay["assignments"]>();
    for (const row of assignmentResult) {
      const assignments = assignmentsByDate.get(row.scheduled_for) ?? [];
      assignments.push({
        topicId: row.topic_id,
        scheduledFor: row.scheduled_for,
        position: row.position,
        workloadPoints: row.workload_points,
        isLocked: row.is_locked,
        completedAt: row.completed_at,
      });
      assignmentsByDate.set(row.scheduled_for, assignments);
    }

    const settings = new Map(topicResult.map((row) => [row.topic_id, row]));
    const assignmentTopicIds = new Set(
      assignmentResult.map((row) => row.topic_id),
    );
    const scopeTopicIds = topicResult.map((row) => row.topic_id);
    const scopeTopicIdSet = new Set(scopeTopicIds);
    const topics: ExamPlanTopic[] = material.topics
      .filter(
        (topic) =>
          scopeTopicIdSet.has(topic.id) || assignmentTopicIds.has(topic.id),
      )
      .map((topic) => {
        const setting = settings.get(topic.id);
        return setting
          ? {
              ...topic,
              workloadPoints: setting.workload_points,
              workloadSource: setting.workload_source,
            }
          : topic;
      });

    const plan = mapPlan(planResult.data);
    return {
      plan,
      topics,
      scopeTopicIds,
      days: dayResult.map((row) => ({
        date: row.target_date,
        assignments: assignmentsByDate.get(row.target_date) ?? [],
        workloadPoints: row.workload_points,
        reviewTarget: row.review_target,
        reviewForecastLow: row.review_forecast_low,
        reviewForecastHigh: row.review_forecast_high,
        isBufferDay: row.is_buffer_day,
        isOverloaded:
          row.is_overloaded ||
          (plan.dailyTimeLimitMinutes !== null &&
            Math.ceil(
              row.workload_points * 5 +
                (row.review_forecast_low *
                  material.reviewSecondsPerQuestion *
                  0.8) /
                  60,
            ) > plan.dailyTimeLimitMinutes),
        estimatedMinutesLow: Math.ceil(
          row.workload_points * 5 +
            (row.review_forecast_low *
              material.reviewSecondsPerQuestion *
              0.8) /
              60,
        ),
        estimatedMinutesHigh: Math.ceil(
          row.workload_points * 12 +
            (row.review_forecast_high *
              material.reviewSecondsPerQuestion *
              1.2) /
              60,
        ),
      })),
      unassignedQuestionCount: material.unassignedQuestionCount,
      unassignedDueReviewCount: material.unassignedDueReviewCount,
      unassignedReviewDueDates: material.unassignedReviewDueDates,
      reviewSecondsPerQuestion: material.reviewSecondsPerQuestion,
      paceSampleSize: material.paceSampleSize,
    };
  }

  async getPlanningScope(moduleId: string): Promise<ExamPlanningScope> {
    const { data, error } = await this.client.rpc("get_exam_planning_scope", {
      target_module_id: moduleId,
      timezone_name: planningTimeZone(),
    });
    throwIfPostgrestError(error);
    if (!data) throw new Error("Nie udało się pobrać zakresu egzaminu.");
    return data as unknown as ExamPlanningScope;
  }

  async getPlanningChapters(
    moduleId: string,
    options: {
      query?: string;
      cursor?: { position: number; id: string };
      limit?: number;
    } = {},
  ): Promise<ExamPlanningChapterPage> {
    const { data, error } = await this.client.rpc(
      "get_exam_planning_chapters",
      {
        target_module_id: moduleId,
        search_query: options.query?.trim() || null,
        after_position: options.cursor?.position ?? null,
        after_id: options.cursor?.id ?? null,
        result_limit: options.limit ?? 50,
      },
    );
    throwIfPostgrestError(error);
    if (!data) throw new Error("Nie udało się pobrać rozdziałów.");
    return data as unknown as ExamPlanningChapterPage;
  }

  async getPlanningTopics(
    moduleId: string,
    chapterIds?: string[],
    searchQuery?: string,
  ) {
    const { data, error } = await this.client.rpc("get_exam_planning_topics", {
      target_module_id: moduleId,
      target_chapter_ids: chapterIds ?? null,
      timezone_name: planningTimeZone(),
      search_query: searchQuery?.trim() || null,
      result_limit: null,
    });
    throwIfPostgrestError(error);
    return (data ?? []) as unknown as ExamPlanTopic[];
  }

  async searchPlanningTopics(moduleId: string, query: string) {
    const { data, error } = await this.client.rpc("get_exam_planning_topics", {
      target_module_id: moduleId,
      target_chapter_ids: null,
      timezone_name: planningTimeZone(),
      search_query: query.trim(),
      result_limit: 100,
    });
    throwIfPostgrestError(error);
    return (data ?? []) as unknown as ExamPlanTopic[];
  }

  async getPlanningMaterial(moduleId: string): Promise<ExamPlanningMaterial> {
    const [scope, topics] = await Promise.all([
      this.getPlanningScope(moduleId),
      this.getPlanningTopics(moduleId),
    ]);
    return {
      ...scope,
      topics,
    };
  }

  async save(input: SaveExamPlanInput) {
    const { data, error } = await this.client.rpc("save_exam_plan", {
      plan_payload: {
        id: input.id,
        expectedPlanVersion: input.expectedPlanVersion,
        rebuiltOn: input.rebuiltOn,
        moduleId: input.moduleId,
        name: input.name,
        examDate: input.examDate,
        targetRetention: input.targetRetention,
        studyWeekdays: input.studyWeekdays,
        dailyTimeLimitMinutes: input.dailyTimeLimitMinutes,
        dailyQuestionLimit: input.dailyQuestionLimit,
        bufferPercent: input.bufferPercent,
        includeUnassignedQuestions: input.includeUnassignedQuestions,
        topicSettings: input.topicSettings.map((topic) => ({
          id: topic.id,
          workload_points: topic.workloadPoints,
          workload_source: topic.workloadSource,
        })),
        assignments: input.days.flatMap((day) =>
          day.assignments.map((assignment) => ({
            topic_id: assignment.topicId,
            scheduled_for: assignment.scheduledFor,
            position: assignment.position,
            workload_points: assignment.workloadPoints,
            is_locked: assignment.isLocked,
            completed_at: assignment.completedAt,
          })),
        ),
        days: input.days.map((day) => ({
          target_date: day.date,
          topic_count: day.assignments.length,
          workload_points: day.workloadPoints,
          review_target: day.reviewTarget,
          review_forecast_low: day.reviewForecastLow,
          review_forecast_high: day.reviewForecastHigh,
          is_buffer_day: day.isBufferDay,
          is_overloaded: day.isOverloaded,
        })),
      } as Json,
    });
    throwIfPostgrestError(error);
    if (!data) throw new Error("Nie udało się zapisać planu egzaminu.");
    return data;
  }

  async rebuild(
    planId: string,
    creditedTopicIds: Iterable<string> = [],
    todayKey = localDateKey(),
  ) {
    const details = await this.get(planId);
    const completedTopicIds = new Set(
      details.topics
        .filter((topic) => topic.completed)
        .map((topic) => topic.id),
    );
    const historicalDays = details.days
      .filter((day) => day.date < todayKey)
      .map((day) => ({
        ...day,
        assignments: day.assignments.filter(
          (assignment) =>
            assignment.completedAt !== null ||
            completedTopicIds.has(assignment.topicId),
        ),
      }))
      .map((day) => ({
        ...day,
        workloadPoints: day.assignments.reduce(
          (sum, assignment) => sum + assignment.workloadPoints,
          0,
        ),
      }));
    const generated = generateExamPlan({
      today: todayKey,
      examDate: details.plan.examDate,
      studyWeekdays: details.plan.studyWeekdays,
      bufferPercent: details.plan.bufferPercent,
      targetRetention: details.plan.targetRetention,
      dailyQuestionLimit: details.plan.dailyQuestionLimit,
      dailyTimeLimitMinutes: details.plan.dailyTimeLimitMinutes,
      reviewSecondsPerQuestion: details.reviewSecondsPerQuestion,
      topics: details.topics.filter((topic) =>
        details.scopeTopicIds.includes(topic.id),
      ),
      unassignedQuestionCount: details.plan.includeUnassignedQuestions
        ? details.unassignedQuestionCount
        : 0,
      unassignedDueReviewCount: details.plan.includeUnassignedQuestions
        ? details.unassignedDueReviewCount
        : 0,
      unassignedReviewDueDates: details.plan.includeUnassignedQuestions
        ? details.unassignedReviewDueDates
        : [],
      lockedAssignments: details.days
        .flatMap((day) => day.assignments)
        .filter(
          (assignment) =>
            assignment.isLocked && assignment.scheduledFor >= todayKey,
        ),
      creditedTopicIds,
    });
    await this.save({
      id: details.plan.id,
      expectedPlanVersion: details.plan.planVersion,
      rebuiltOn: todayKey,
      moduleId: details.plan.moduleId,
      name: details.plan.name,
      examDate: details.plan.examDate,
      targetRetention: details.plan.targetRetention,
      studyWeekdays: details.plan.studyWeekdays,
      dailyTimeLimitMinutes: details.plan.dailyTimeLimitMinutes,
      dailyQuestionLimit: details.plan.dailyQuestionLimit,
      bufferPercent: details.plan.bufferPercent,
      includeUnassignedQuestions: details.plan.includeUnassignedQuestions,
      topicSettings: details.topics.filter((topic) =>
        details.scopeTopicIds.includes(topic.id),
      ),
      days: [...historicalDays, ...generated.days],
    });
    return this.get(planId);
  }

  async rebuildAdaptivePlans(today = localDateKey(), force = false) {
    const running = adaptiveRebuilds.get(this.userId);
    if (running) {
      await running;
      if (!force) return;
    }
    const rebuild = this.runAdaptiveRebuild(today, force).finally(() => {
      adaptiveRebuilds.delete(this.userId);
    });
    adaptiveRebuilds.set(this.userId, rebuild);
    return rebuild;
  }

  private async runAdaptiveRebuild(today: string, force: boolean) {
    const plans = (await this.list()).filter(
      (plan) => plan.status === "active" && plan.examDate >= today,
    );
    if (!plans.length) return;
    const planIds = plans.map((plan) => plan.id);
    const assignmentsResult = await this.client
      .from("exam_plan_assignments")
      .select("exam_plan_id,topic_id")
      .eq("user_id", this.userId)
      .lt("scheduled_for", today)
      .is("completed_at", null)
      .in("exam_plan_id", planIds);
    throwIfPostgrestError(assignmentsResult.error);

    const pastAssignments = assignmentsResult.data ?? [];
    const pastTopicIds = [
      ...new Set(pastAssignments.map((assignment) => assignment.topic_id)),
    ];
    const topicsResult = pastTopicIds.length
      ? await this.client
          .from("topics")
          .select("id,completed")
          .eq("user_id", this.userId)
          .in("id", pastTopicIds)
      : { data: [], error: null };
    throwIfPostgrestError(topicsResult.error);
    const incompleteTopicIds = new Set(
      (topicsResult.data ?? [])
        .filter((topic) => !topic.completed)
        .map((topic) => topic.id),
    );
    const missedPlanIds = new Set(
      pastAssignments
        .filter((assignment) => incompleteTopicIds.has(assignment.topic_id))
        .map((assignment) => assignment.exam_plan_id),
    );
    if (
      !force &&
      !plans.some(
        (plan) =>
          plan.needsRebuild ||
          plan.lastRebuiltOn !== today ||
          missedPlanIds.has(plan.id),
      )
    )
      return;

    const details = await Promise.all(plans.map((plan) => this.get(plan.id)));
    details.sort((first, second) => {
      const deadlineOrder = first.plan.examDate.localeCompare(
        second.plan.examDate,
      );
      if (deadlineOrder) return deadlineOrder;
      const firstScoped = first.topics.filter((topic) =>
        first.scopeTopicIds.includes(topic.id),
      );
      const secondScoped = second.topics.filter((topic) =>
        second.scopeTopicIds.includes(topic.id),
      );
      const firstMastery = firstScoped.length
        ? firstScoped.filter((topic) => topic.completed).length /
          firstScoped.length
        : 1;
      const secondMastery = secondScoped.length
        ? secondScoped.filter((topic) => topic.completed).length /
          secondScoped.length
        : 1;
      const firstDeficit = first.plan.targetRetention - firstMastery;
      const secondDeficit = second.plan.targetRetention - secondMastery;
      return secondDeficit - firstDeficit;
    });

    const creditedTopicIds = new Set<string>();
    for (const detail of details) {
      const rebuilt = await this.rebuild(
        detail.plan.id,
        creditedTopicIds,
        today,
      );
      for (const assignment of rebuilt.days.flatMap((day) => day.assignments)) {
        if (assignment.scheduledFor >= today)
          creditedTopicIds.add(assignment.topicId);
      }
    }
  }

  async moveAssignment(planId: string, topicId: string, targetDate: string) {
    const details = await this.get(planId);
    const days = details.days.map((day) => ({
      ...day,
      assignments: day.assignments.filter(
        (assignment) => assignment.topicId !== topicId,
      ),
    }));
    const target = days.find(
      (day) => day.date === targetDate && !day.isBufferDay,
    );
    const previous = details.days
      .flatMap((day) => day.assignments)
      .find((assignment) => assignment.topicId === topicId);
    if (!target || !previous)
      throw new Error("Nie można przenieść tematu na wybrany dzień.");
    target.assignments.push({
      ...previous,
      scheduledFor: targetDate,
      position: target.assignments.length + 1,
      isLocked: true,
    });
    for (const day of days) {
      day.assignments.forEach((assignment, index) => {
        assignment.position = index + 1;
      });
      day.workloadPoints = day.assignments.reduce(
        (sum, assignment) => sum + assignment.workloadPoints,
        0,
      );
    }
    await this.save({
      id: details.plan.id,
      expectedPlanVersion: details.plan.planVersion,
      moduleId: details.plan.moduleId,
      name: details.plan.name,
      examDate: details.plan.examDate,
      targetRetention: details.plan.targetRetention,
      studyWeekdays: details.plan.studyWeekdays,
      dailyTimeLimitMinutes: details.plan.dailyTimeLimitMinutes,
      dailyQuestionLimit: details.plan.dailyQuestionLimit,
      bufferPercent: details.plan.bufferPercent,
      includeUnassignedQuestions: details.plan.includeUnassignedQuestions,
      topicSettings: details.topics.filter((topic) =>
        details.scopeTopicIds.includes(topic.id),
      ),
      days,
    });
    return this.get(planId);
  }

  async delete(planId: string) {
    const { error } = await this.client
      .from("exam_plans")
      .delete()
      .eq("id", planId)
      .eq("user_id", this.userId);
    throwIfPostgrestError(error);
  }
}
