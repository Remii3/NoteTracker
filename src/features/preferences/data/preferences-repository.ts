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
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  weeklyGoalEnabled: true,
  weeklyTopics: 5,
  reviewRemindersEnabled: false,
  reviewReminderIntervalDays: 7,
  lastReviewReminderAt: null,
};

export class PreferencesRepository {
  private readonly client: SupabaseClient<Database>;
  private readonly userId: string;

  constructor(client: SupabaseClient<Database>, userId: string) {
    this.client = client;
    this.userId = userId;
  }

  async get(): Promise<UserPreferences> {
    const { data, error } = await this.client
      .from("study_goals")
      .select(
        "weekly_topics_enabled, weekly_topics, review_reminders_enabled, review_reminder_interval_days, last_review_reminder_at",
      )
      .eq("user_id", this.userId)
      .maybeSingle();
    throwIfPostgrestError(error);

    if (!data) return DEFAULT_USER_PREFERENCES;
    return {
      weeklyGoalEnabled: data.weekly_topics_enabled,
      weeklyTopics: data.weekly_topics,
      reviewRemindersEnabled: data.review_reminders_enabled,
      reviewReminderIntervalDays:
        data.review_reminder_interval_days as ReviewReminderInterval,
      lastReviewReminderAt: data.last_review_reminder_at,
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
  }
}
