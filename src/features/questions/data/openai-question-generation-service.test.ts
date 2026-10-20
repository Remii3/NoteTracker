import { afterEach, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { OpenAiQuestionGenerationService } from "./openai-question-generation-service";

afterEach(() => {
  vi.unstubAllGlobals();
});

function authenticatedClient() {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "session-token" } },
        error: null,
      }),
    },
  } as unknown as SupabaseClient<Database>;
}

it("reads disabled AI state from worker config", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(Response.json({ maxTopics: 5, available: false })),
  );
  const service = new OpenAiQuestionGenerationService(
    authenticatedClient(),
    "https://ai.example.com",
  );

  await expect(service.getConfig()).resolves.toEqual({
    maxTopics: 5,
    available: false,
  });
});

it("disables AI when the worker reports unavailable credentials", async () => {
  const onUnavailable = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: "Brak lub nieprawidłowy klucz OpenAI." },
          { status: 503 },
        ),
      ),
  );
  const service = new OpenAiQuestionGenerationService(
    authenticatedClient(),
    "https://ai.example.com",
    onUnavailable,
  );

  await expect(
    service.generate({
      moduleId: "module-id",
      topicIds: ["topic-id"],
      questionCount: 1,
    }),
  ).rejects.toThrow("Brak lub nieprawidłowy klucz OpenAI.");
  expect(onUnavailable).toHaveBeenCalledWith(
    "Brak lub nieprawidłowy klucz OpenAI.",
  );
});
