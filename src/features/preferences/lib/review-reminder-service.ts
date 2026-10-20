import { toast } from "@/components/ui/toast";
import type { TodayDashboard } from "@/features/today/model/types";
import { supabase } from "@/lib/supabase/client";
import { isReminderDue } from "./review-reminder";

const checkingUsers = new Set<string>();

export async function showReminderIfDue(
  userId: string,
  timezone: string,
  startReview: (target: {
    moduleId: string;
    moduleSlug: string;
  }) => Promise<void>,
) {
  if (checkingUsers.has(userId)) return;
  checkingUsers.add(userId);
  try {
    const { data: preferences, error: preferencesError } = await supabase
      .from("study_goals")
      .select(
        "review_reminders_enabled, review_reminder_interval_days, last_review_reminder_at",
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (preferencesError || !preferences?.review_reminders_enabled) return;
    if (
      !isReminderDue(
        preferences.last_review_reminder_at,
        preferences.review_reminder_interval_days,
      )
    )
      return;

    const { data, error: dashboardError } = await supabase.rpc(
      "get_today_dashboard",
      { timezone_name: timezone },
    );
    if (dashboardError) return;
    const dashboard = data as unknown as TodayDashboard;
    const target = dashboard.sessionTarget;
    if (!target || dashboard.dueQuestionCount < 1) return;
    const question = dashboard.dueQuestions.find(
      (item) => item.moduleId === target.moduleId,
    );

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("study_goals")
      .update({ last_review_reminder_at: now, updated_at: now })
      .eq("user_id", userId);
    if (updateError) return;

    toast.add({
      data: { type: "info" },
      title: "Czas na krótką powtórkę",
      description: `${dashboard.dueQuestionCount} ${questionCountLabel(dashboard.dueQuestionCount)} ${dashboard.dueQuestionCount === 1 ? "czeka" : "czekają"} na powtórkę.${question ? ` Zacznij od: ${question.content}` : ""}`,
      timeout: 12_000,
      actionProps: {
        children: "Powtórz",
        onClick: () => void startReview(target),
      },
    });
  } finally {
    checkingUsers.delete(userId);
  }
}

function questionCountLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 12 && lastTwo <= 14) return "pytań";
  if (last >= 2 && last <= 4) return "pytania";
  if (count === 1) return "pytanie";
  return "pytań";
}
