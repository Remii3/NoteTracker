import { useEffect } from "react";
import { useNavigate } from "react-router";

import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-context";
import { supabase } from "@/lib/supabase/client";
import { showReminderIfDue } from "../lib/review-reminder-service";

const REMINDER_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function InAppReviewReminder() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    const check = () =>
      void showReminderIfDue(user.id, timezone, async (target) => {
        const { data, error } = await supabase.rpc(
          "create_fsrs_study_session",
          {
            target_module_id: target.moduleId,
            requested_question_count: 10,
            timezone_name: timezone,
          },
        );
        if (error || !data) {
          toast.add({
            data: { type: "error" },
            description: "Nie udało się rozpocząć powtórki.",
          });
          return;
        }
        navigate(`/${target.moduleSlug}/study/flashcards/${data}?from=today`, {
          state: { moduleId: target.moduleId },
        });
      });
    check();
    const interval = window.setInterval(check, REMINDER_CHECK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [navigate, user]);

  return null;
}
