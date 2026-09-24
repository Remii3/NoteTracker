import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { clearMemoryCacheByPrefix } from "@/lib/memory-cache";
import { throwIfPostgrestError } from "@/features/notes/data/supabase-error";
import type { QuestionsRepository } from "./questions-repository";
import type {
  FsrsCardState,
  FsrsRating,
  FsrsStateName,
  Question,
  QuestionOption,
  StudySessionSummary,
} from "../model/types";
type ReviewStateRow = {
  due_at: string;
  last_reviewed_at: string | null;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  repetitions: number;
  lapses: number;
  state: FsrsStateName;
  version: number;
};

export class SupabaseQuestionsRepository implements QuestionsRepository {
  private readonly client: SupabaseClient<Database>;
  private readonly userId: string;
  private readonly moduleId: string;
  constructor(
    client: SupabaseClient<Database>,
    userId: string,
    moduleId: string,
  ) {
    this.client = client;
    this.userId = userId;
    this.moduleId = moduleId;
  }

  async getAvailability(
    filters: {
      chapterId?: string;
      topicId?: string;
      onlyUnassigned?: boolean;
    } = {},
  ) {
    const { data, error } = await this.client.rpc(
      "get_question_bank_availability",
      {
        target_module_id: this.moduleId,
        selected_chapter_id: filters.chapterId ?? null,
        selected_topic_id: filters.topicId ?? null,
        only_unassigned: filters.onlyUnassigned ?? false,
      },
    );
    throwIfPostgrestError(error);
    return data as unknown as {
      flashcardsCount: number;
      testQuestionsCount: number;
    };
  }

  async list(filters: Parameters<QuestionsRepository["list"]>[0] = {}) {
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 20;
    let query = this.client
      .from("questions")
      .select(
        "id,chapter_id,topic_id,content,explanation,chapters(title),topics(title),question_options(id,content,is_correct,position)",
        { count: "exact" },
      )
      .eq("user_id", this.userId)
      .eq("module_id", this.moduleId)
      .is("trash_id", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (filters.topicId) query = query.eq("topic_id", filters.topicId);
    else if (filters.chapterId)
      query = query.eq("chapter_id", filters.chapterId);
    if (filters.query?.trim())
      query = query.ilike(
        "content",
        `%${filters.query.trim().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
      );
    const { data, error, count } = await query;
    throwIfPostgrestError(error);
    return {
      questions: (data ?? []).map((row) => this.mapQuestion(row)),
      total: count ?? 0,
    };
  }

  async save(input: Parameters<QuestionsRepository["save"]>[0]) {
    const { data, error } = await this.client.rpc("save_question", {
      target_module_id: this.moduleId,
      question_id: input.id ?? null,
      question_content: input.content,
      question_explanation: input.explanation ?? "",
      selected_chapter_id: input.chapterId,
      selected_topic_id: input.topicId,
      options: input.options.map((option) => ({
        content: option.content,
        isCorrect: option.isCorrect,
      })) as Json,
    });
    throwIfPostgrestError(error);
    if (!data) throw new Error("Nie udało się zapisać pytania.");
    return data;
  }

  async remove(id: string) {
    const { error } = await this.client.rpc("move_to_trash", {
      target_type: "question",
      target_id: id,
    });
    throwIfPostgrestError(error);
  }

  async importQuestions(
    draft: Parameters<QuestionsRepository["importQuestions"]>[0],
  ) {
    const { data, error } = await this.client.rpc(
      "import_questions_into_module",
      {
        target_module_id: this.moduleId,
        imported_questions: draft.questions.map((question) => ({
          content: question.content,
          explanation: question.explanation,
          options: question.options,
        })) as Json,
      },
    );
    throwIfPostgrestError(error);
    clearMemoryCacheByPrefix(`statistics:${this.userId}:`);
    return data ?? 0;
  }

  async createSession(
    input: Parameters<QuestionsRepository["createSession"]>[0],
  ) {
    const { data, error } = await this.client.rpc("create_study_session", {
      target_module_id: this.moduleId,
      study_mode: input.mode,
      scope_mode: input.scope,
      selected_chapter_id: input.chapterId ?? null,
      selected_topic_id: input.topicId ?? null,
      random_chapter_count: input.randomChapterCount,
      requested_question_count: input.questionCount,
      hide_flashcard_options: input.hideFlashcardOptions,
    });
    throwIfPostgrestError(error);
    if (!data) throw new Error("Nie udało się utworzyć sesji.");
    return data;
  }

  async listSessions(
    options: Parameters<QuestionsRepository["listSessions"]>[0] = {},
  ) {
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 20;
    const sessionsResult = await this.client
      .from("study_sessions")
      .select("id,mode,status,configuration,started_at,completed_at", {
        count: "exact",
      })
      .eq("user_id", this.userId)
      .eq("module_id", this.moduleId)
      .is("trash_id", null)
      .order("started_at", { ascending: false })
      .range(offset, offset + limit - 1);
    throwIfPostgrestError(sessionsResult.error);

    const rows = sessionsResult.data ?? [];
    if (!rows.length) return { sessions: [], total: sessionsResult.count ?? 0 };

    const itemsResult = await this.client
      .from("study_session_items")
      .select("session_id,result")
      .eq("user_id", this.userId)
      .in(
        "session_id",
        rows.map((session) => session.id),
      );
    throwIfPostgrestError(itemsResult.error);

    const resultsBySession = new Map<
      string,
      { total: number; answered: number; successful: number }
    >();
    for (const item of itemsResult.data ?? []) {
      const counts = resultsBySession.get(item.session_id) ?? {
        total: 0,
        answered: 0,
        successful: 0,
      };
      counts.total += 1;
      if (item.result) counts.answered += 1;
      if (item.result === "correct" || item.result === "remembered")
        counts.successful += 1;
      resultsBySession.set(item.session_id, counts);
    }

    return {
      sessions: rows.map((session) => {
        const counts = resultsBySession.get(session.id) ?? {
          total: 0,
          answered: 0,
          successful: 0,
        };
        return {
          id: session.id,
          mode: session.mode,
          status: session.status,
          configuration: this.asConfiguration(session.configuration),
          startedAt: session.started_at,
          completedAt: session.completed_at,
          totalCount: counts.total,
          answeredCount: counts.answered,
          successfulCount: counts.successful,
        } satisfies StudySessionSummary;
      }),
      total: sessionsResult.count ?? 0,
    };
  }

  async getSession(id: string) {
    const [session, items, profile] = await Promise.all([
      this.client
        .from("study_sessions")
        .select("id,mode,status,configuration,started_at,completed_at")
        .eq("id", id)
        .eq("user_id", this.userId)
        .eq("module_id", this.moduleId)
        .is("trash_id", null)
        .single(),
      this.client
        .from("study_session_items")
        .select(
          "id,question_id,position,question_snapshot,options_snapshot,explanation_snapshot,selected_option_id,result,active_duration_seconds",
        )
        .eq("session_id", id)
        .eq("user_id", this.userId)
        .order("position"),
      this.client
        .from("fsrs_profiles")
        .select("desired_retention,parameters,parameters_version")
        .eq("user_id", this.userId)
        .maybeSingle(),
    ]);
    throwIfPostgrestError(session.error);
    throwIfPostgrestError(items.error);
    throwIfPostgrestError(profile.error);
    if (!session.data) throw new Error("Nie znaleziono sesji.");
    const questionIds = (items.data ?? [])
      .map((item) => item.question_id)
      .filter((value): value is string => Boolean(value));
    const states = questionIds.length
      ? await this.client
          .from("question_review_states")
          .select(
            "question_id,due_at,last_reviewed_at,stability,difficulty,elapsed_days,scheduled_days,learning_steps,repetitions,lapses,state,version",
          )
          .eq("user_id", this.userId)
          .in("question_id", questionIds)
      : { data: [], error: null };
    throwIfPostgrestError(states.error);
    const stateByQuestion = new Map(
      (states.data ?? []).map((state) => [state.question_id, state]),
    );
    const now = new Date().toISOString();
    return {
      id: session.data.id,
      mode: session.data.mode,
      status: session.data.status,
      configuration: this.asConfiguration(session.data.configuration),
      startedAt: session.data.started_at,
      completedAt: session.data.completed_at,
      fsrsProfile: {
        desiredRetention: profile.data?.desired_retention ?? 0.9,
        parameters: profile.data?.parameters ?? null,
        parametersVersion: profile.data?.parameters_version ?? 1,
      },
      items: (items.data ?? []).map((item) => ({
        id: item.id,
        questionId: item.question_id!,
        position: item.position,
        question: item.question_snapshot,
        options: item.options_snapshot as unknown as Required<QuestionOption>[],
        explanation: item.explanation_snapshot,
        selectedOptionId: item.selected_option_id,
        result: item.result,
        activeDurationSeconds: item.active_duration_seconds,
        fsrs: this.mapFsrsState(stateByQuestion.get(item.question_id!), now),
      })),
    };
  }

  async answerItem(
    id: string,
    rating: FsrsRating,
    selectedOptionId?: string,
    activeDurationSeconds = 0,
  ) {
    const session = await this.getItemFsrsContext(id);
    const reviewedAt = new Date();
    const { error } = await this.client.rpc("record_fsrs_review", {
      target_session_item_id: id,
      review_rating: rating,
      review_time: reviewedAt.toISOString(),
      selected_option: selectedOptionId ?? null,
      duration_seconds: Math.min(
        86_400,
        Math.max(0, Math.round(activeDurationSeconds)),
      ),
      expected_version: session.state.version,
      used_parameters_version: session.profile.parametersVersion,
    });
    throwIfPostgrestError(error);
  }

  private async getItemFsrsContext(id: string) {
    const item = await this.client
      .from("study_session_items")
      .select("question_id")
      .eq("id", id)
      .eq("user_id", this.userId)
      .single();
    throwIfPostgrestError(item.error);
    if (!item.data?.question_id) throw new Error("Pytanie nie istnieje.");
    const [state, profile] = await Promise.all([
      this.client
        .from("question_review_states")
        .select(
          "due_at,last_reviewed_at,stability,difficulty,elapsed_days,scheduled_days,learning_steps,repetitions,lapses,state,version",
        )
        .eq("user_id", this.userId)
        .eq("question_id", item.data.question_id)
        .maybeSingle(),
      this.client
        .from("fsrs_profiles")
        .select("desired_retention,parameters,parameters_version")
        .eq("user_id", this.userId)
        .maybeSingle(),
    ]);
    throwIfPostgrestError(state.error);
    throwIfPostgrestError(profile.error);
    return {
      state: this.mapFsrsState(state.data, new Date().toISOString()),
      profile: {
        desiredRetention: profile.data?.desired_retention ?? 0.9,
        parameters: profile.data?.parameters ?? null,
        parametersVersion: profile.data?.parameters_version ?? 1,
      },
    };
  }

  private mapFsrsState(
    row: ReviewStateRow | null | undefined,
    fallbackDue: string,
  ): FsrsCardState {
    return row
      ? {
          dueAt: row.due_at,
          lastReviewedAt: row.last_reviewed_at,
          stability: row.stability,
          difficulty: row.difficulty,
          elapsedDays: row.elapsed_days,
          scheduledDays: row.scheduled_days,
          learningSteps: row.learning_steps,
          repetitions: row.repetitions,
          lapses: row.lapses,
          state: row.state,
          learningStatus: this.learningStatus(row.state, row.due_at),
          version: row.version,
        }
      : {
          dueAt: fallbackDue,
          lastReviewedAt: null,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          learningSteps: 0,
          repetitions: 0,
          lapses: 0,
          state: "new",
          learningStatus: "new",
          version: 0,
        };
  }

  private learningStatus(state: FsrsStateName, dueAt: string) {
    if (state === "new") return "new" as const;
    if (state === "learning" || state === "relearning")
      return "learning" as const;
    if (new Date(dueAt).getTime() < Date.now()) return "overdue" as const;
    return "mastered" as const;
  }
  async completeSession(id: string) {
    const { error } = await this.client
      .from("study_sessions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", this.userId)
      .eq("module_id", this.moduleId)
      .is("trash_id", null)
      .select("id")
      .single();
    throwIfPostgrestError(error);
  }

  async abandonSession(id: string) {
    const { error } = await this.client
      .from("study_sessions")
      .update({ status: "abandoned", completed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", this.userId)
      .eq("status", "in_progress")
      .is("trash_id", null)
      .select("id")
      .single();
    throwIfPostgrestError(error);
  }

  private asConfiguration(value: Json): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  private mapQuestion(row: {
    id: string;
    chapter_id: string | null;
    topic_id: string | null;
    content: string;
    explanation: string | null;
    chapters: { title: string } | null;
    topics: { title: string } | null;
    question_options: Array<{
      id: string;
      content: string;
      is_correct: boolean;
      position: number;
    }>;
  }): Question {
    return {
      id: row.id,
      chapterId: row.chapter_id,
      topicId: row.topic_id,
      chapterTitle: row.chapters?.title ?? null,
      topicTitle: row.topics?.title ?? null,
      content: row.content,
      explanation: row.explanation,
      options: [...row.question_options]
        .sort((a, b) => a.position - b.position)
        .map((option) => ({
          id: option.id,
          content: option.content,
          isCorrect: option.is_correct,
        })),
    };
  }
}
