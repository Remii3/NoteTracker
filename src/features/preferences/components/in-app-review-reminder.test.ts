// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
  toast: vi.fn(),
  updateEq: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: mocks.maybeSingle })),
      })),
      update: vi.fn(() => ({ eq: mocks.updateEq })),
    })),
    rpc: mocks.rpc,
  },
}));

vi.mock("@/components/ui/toast", () => ({
  toast: { add: mocks.toast },
}));

import { showReminderIfDue } from "../lib/review-reminder-service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.maybeSingle.mockResolvedValue({
    data: {
      review_reminders_enabled: true,
      review_reminder_interval_days: 1,
      last_review_reminder_at: null,
    },
    error: null,
  });
  mocks.updateEq.mockResolvedValue({ error: null });
});

it("offers an FSRS session only when questions are due", async () => {
  mocks.rpc.mockResolvedValue({
    data: {
      dueQuestionCount: 2,
      dueQuestions: [
        {
          moduleId: "module-one",
          content: "Pytanie należne teraz",
        },
      ],
      sessionTarget: {
        moduleId: "module-one",
        moduleSlug: "anatomia",
      },
    },
    error: null,
  });
  const startReview = vi.fn().mockResolvedValue(undefined);

  await showReminderIfDue("user-one", "Europe/Warsaw", startReview);

  expect(mocks.rpc).toHaveBeenCalledWith("get_today_dashboard", {
    timezone_name: "Europe/Warsaw",
  });
  expect(mocks.toast).toHaveBeenCalledOnce();
  const notification = mocks.toast.mock.calls[0][0];
  expect(notification.description).toContain("2 pytania czekają");
  notification.actionProps.onClick();
  expect(startReview).toHaveBeenCalledWith({
    moduleId: "module-one",
    moduleSlug: "anatomia",
  });
});

it("does not remind when the FSRS queue is empty", async () => {
  mocks.rpc.mockResolvedValue({
    data: {
      dueQuestionCount: 0,
      dueQuestions: [],
      sessionTarget: null,
    },
    error: null,
  });

  await showReminderIfDue("user-one", "Europe/Warsaw", vi.fn());

  expect(mocks.toast).not.toHaveBeenCalled();
  expect(mocks.updateEq).not.toHaveBeenCalled();
});
