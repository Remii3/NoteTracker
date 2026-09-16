import { useEffect } from "react";
import { useNavigate } from "react-router";

import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-context";
import { supabase } from "@/lib/supabase/client";
import { isReminderDue } from "../lib/review-reminder";

const checkingUsers = new Set<string>();
const REMINDER_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function InAppReviewReminder() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    const check = () =>
      void showReminderIfDue(user.id, (moduleSlug) => {
        navigate(`/${moduleSlug}/questions`);
      });
    check();
    const interval = window.setInterval(check, REMINDER_CHECK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [navigate, user]);

  return null;
}

async function showReminderIfDue(
  userId: string,
  openQuestions: (moduleSlug: string) => void,
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
    ) {
      return;
    }

    const { data: question, error: questionError } = await supabase
      .from("questions")
      .select("content, module_id")
      .is("trash_id", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (questionError || !question) return;

    const { data: module, error: moduleError } = await supabase
      .from("modules")
      .select("slug")
      .eq("id", question.module_id)
      .is("trash_id", null)
      .maybeSingle();
    if (moduleError || !module) return;

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("study_goals")
      .update({ last_review_reminder_at: now, updated_at: now })
      .eq("user_id", userId);
    if (updateError) return;

    toast.add({
      data: { type: "info" },
      title: "Czas na krótką powtórkę",
      description: question.content,
      timeout: 12_000,
      actionProps: {
        children: "Powtórz",
        onClick: () => openQuestions(module.slug),
      },
    });
  } finally {
    checkingUsers.delete(userId);
  }
}
