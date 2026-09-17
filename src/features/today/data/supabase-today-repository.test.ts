import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import { SupabaseTodayRepository } from "./supabase-today-repository";

function createRepository(fetchMock: typeof globalThis.fetch) {
  const client = createClient<Database>(
    "https://example.supabase.co",
    "test-key",
    {
      global: { fetch: fetchMock },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return new SupabaseTodayRepository(client, "user-one");
}

it("loads the Today dashboard in the user's timezone", async () => {
  const dashboard = {
    date: "2026-09-17",
    dueQuestionCount: 0,
    dueQuestions: [],
    recommendedTopics: [],
    nearestExam: null,
    weeklyGoal: { target: 5, completed: 0, enabled: true },
    recentSummary: null,
    sessionTarget: null,
    modules: [],
  };
  const fetch = vi.fn().mockResolvedValueOnce(
    new Response(JSON.stringify(dashboard), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

  await expect(
    createRepository(fetch as typeof globalThis.fetch).get("Europe/Warsaw"),
  ).resolves.toEqual(dashboard);

  const request = fetch.mock.calls[0];
  expect(new URL(request[0]).pathname).toContain("/rpc/get_today_dashboard");
  expect(JSON.parse(request[1].body)).toEqual({
    timezone_name: "Europe/Warsaw",
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("stores a deferral under the current user's id", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));

  await createRepository(fetch as typeof globalThis.fetch).deferTask({
    taskType: "topic",
    taskId: "topic-one",
    until: "2026-09-20",
  });

  const request = fetch.mock.calls[0];
  expect(new URL(request[0]).pathname).toContain("/study_task_deferrals");
  expect(JSON.parse(request[1].body)).toEqual(
    expect.objectContaining({
      user_id: "user-one",
      task_type: "topic",
      task_id: "topic-one",
      deferred_until: "2026-09-20",
    }),
  );
});

it("creates a ten-question quick session", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify("session-one"), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

  await expect(
    createRepository(fetch as typeof globalThis.fetch).createQuickSession(
      "module-one",
      "Europe/Warsaw",
    ),
  ).resolves.toBe("session-one");

  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(
    expect.objectContaining({
      target_module_id: "module-one",
      requested_question_count: 10,
      timezone_name: "Europe/Warsaw",
    }),
  );
});
