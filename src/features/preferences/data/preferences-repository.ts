import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { throwIfPostgrestError } from "@/features/notes/data/supabase-error";

export const REVIEW_REMINDER_INTERVALS = [1, 2, 3, 7, 14, 30] as const;

export type ReviewReminderInterval = (typeof REVIEW_REMINDER_INTERVALS)[number];

export type UserPreferences = {
  weeklyGoalEnabled: boolean;
  weeklyTopics: number;
  reviewRemindersEnabled: boolean;
  reviewReminderIntervalDays: ReviewReminderInterval;
  lastReviewReminderAt: string | null;
  fsrsDesiredRetention: number;
  fsrsReviewCount: number;
  fsrsOptimizedAt: string | null;
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  weeklyGoalEnabled: true,
  weeklyTopics: 5,
  reviewRemindersEnabled: false,
  reviewReminderIntervalDays: 7,
  lastReviewReminderAt: null,
  fsrsDesiredRetention: 0.9,
  fsrsReviewCount: 0,
  fsrsOptimizedAt: null,
};

export class PreferencesRepository {
  private readonly client: SupabaseClient<Database>;
  private readonly userId: string;

  constructor(client: SupabaseClient<Database>, userId: string) {
    this.client = client;
    this.userId = userId;
  }

  async get(): Promise<UserPreferences> {
    const [{ data, error }, profile, logs] = await Promise.all([
      this.client
        .from("study_goals")
        .select(
          "weekly_topics_enabled, weekly_topics, review_reminders_enabled, review_reminder_interval_days, last_review_reminder_at",
        )
        .eq("user_id", this.userId)
        .maybeSingle(),
      this.client
        .from("fsrs_profiles")
        .select("desired_retention,optimized_at")
        .eq("user_id", this.userId)
        .maybeSingle(),
      this.client
        .from("question_review_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", this.userId),
    ]);
    throwIfPostgrestError(error);
    throwIfPostgrestError(profile.error);
    throwIfPostgrestError(logs.error);

    if (!data)
      return {
        ...DEFAULT_USER_PREFERENCES,
        fsrsDesiredRetention: profile.data?.desired_retention ?? 0.9,
        fsrsReviewCount: logs.count ?? 0,
        fsrsOptimizedAt: profile.data?.optimized_at ?? null,
      };
    return {
      weeklyGoalEnabled: data.weekly_topics_enabled,
      weeklyTopics: data.weekly_topics,
      reviewRemindersEnabled: data.review_reminders_enabled,
      reviewReminderIntervalDays:
        data.review_reminder_interval_days as ReviewReminderInterval,
      lastReviewReminderAt: data.last_review_reminder_at,
      fsrsDesiredRetention: profile.data?.desired_retention ?? 0.9,
      fsrsReviewCount: logs.count ?? 0,
      fsrsOptimizedAt: profile.data?.optimized_at ?? null,
    };
  }

  async save(preferences: UserPreferences) {
    const { error } = await this.client.from("study_goals").upsert(
      {
        user_id: this.userId,
        weekly_topics_enabled: preferences.weeklyGoalEnabled,
        weekly_topics: preferences.weeklyTopics,
        review_reminders_enabled: preferences.reviewRemindersEnabled,
        review_reminder_interval_days: preferences.reviewReminderIntervalDays,
        last_review_reminder_at: preferences.lastReviewReminderAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    throwIfPostgrestError(error);
    const profile = await this.client.rpc("save_fsrs_profile", {
      requested_retention: preferences.fsrsDesiredRetention,
      optimized_parameters: null,
    });
    throwIfPostgrestError(profile.error);
  }

  async optimizeFsrs() {
    const { data, error } = await this.client
      .from("question_review_logs")
      .select("question_id,reviewed_at,rating")
      .eq("user_id", this.userId)
      .order("reviewed_at");
    throwIfPostgrestError(error);
    if ((data?.length ?? 0) < 1000)
      throw new Error("Optymalizacja wymaga co najmniej 1000 powtórek.");
    const { optimizeFsrsParameters } = await import("../lib/fsrs-optimizer");
    const parameters = await optimizeFsrsParameters(data ?? []);
    const profile = await this.client.rpc("save_fsrs_profile", {
      requested_retention: (await this.get()).fsrsDesiredRetention,
      optimized_parameters: parameters,
    });
    throwIfPostgrestError(profile.error);
  }
}
