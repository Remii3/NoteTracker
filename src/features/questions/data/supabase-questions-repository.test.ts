import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import { SupabaseQuestionsRepository } from "./supabase-questions-repository";

it("imports questions into the current module in one RPC", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  const client = createClient<Database>(
    "https://example.supabase.co",
    "test-key",
    {
      global: { fetch },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const repository = new SupabaseQuestionsRepository(client, "user", "module");

  const imported = await repository.importQuestions({
    kind: "questions",
    source: "anki",
    name: "Ignored module name",
    warnings: [],
    questions: [
      {
        mode: "test",
        content: "Stolica Polski?",
        explanation: "Warszawa od 1596 roku.",
        options: [
          { content: "Warszawa", isCorrect: true },
          { content: "Kraków", isCorrect: false },
        ],
      },
    ],
  });

  expect(imported).toBe(2);
  const request = fetch.mock.calls[0];
  expect(String(request[0])).toContain("/rpc/import_questions_into_module");
  expect(JSON.parse(request[1].body)).toEqual({
    target_module_id: "module",
    imported_questions: [
      {
        content: "Stolica Polski?",
        explanation: "Warszawa od 1596 roku.",
        options: [
          { content: "Warszawa", isCorrect: true },
          { content: "Kraków", isCorrect: false },
        ],
      },
    ],
  });
});

it("checks duplicate status in the current module", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ kind: "same_content", questionId: "existing" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    ),
  );
  const client = createClient<Database>(
    "https://example.supabase.co",
    "test-key",
    {
      global: { fetch },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const repository = new SupabaseQuestionsRepository(client, "user", "module");

  await expect(
    repository.getDuplicateStatus({
      id: "edited",
      content: "Question",
      options: [{ id: "option", content: "Answer", isCorrect: true }],
    }),
  ).resolves.toEqual({ kind: "same_content", questionId: "existing" });

  const request = fetch.mock.calls[0];
  expect(String(request[0])).toContain("/rpc/get_question_duplicate_status");
  expect(JSON.parse(request[1].body)).toEqual({
    target_module_id: "module",
    excluded_question_id: "edited",
    question_content: "Question",
    options: [{ content: "Answer", isCorrect: true }],
  });
});
