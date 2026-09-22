import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { SupabaseNotesRepository } from "./supabase-notes-repository";
import { EMPTY_RICH_TEXT } from "../model/rich-text-content";
function setup(body: unknown = []) {
  const fetch = vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify(body), {
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
  return {
    fetch,
    repository: new SupabaseNotesRepository(client, "user", "module"),
  };
}
it("filters the chapter search using its own module column", async () => {
  const { fetch, repository } = setup();
  await repository.searchChapters("test");
  const url = new URL(
    fetch.mock.calls.find(([url]) => String(url).includes("/chapters?"))![0],
  );
  expect(url.searchParams.get("module_id")).toBe("eq.module");
  expect(url.searchParams.has("chapters.module_id")).toBe(false);
});
it("sends the entire chapter order in one RPC", async () => {
  const { fetch, repository } = setup(null);
  await repository.reorderChapters(["a", "b"]);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(String(fetch.mock.calls[0][0])).toContain("/rpc/reorder_chapters");
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    chapter_ids: ["a", "b"],
  });
});

it("creates a chapter and its topics atomically in one RPC", async () => {
  const { fetch, repository } = setup(null);
  await repository.createChapterWithTopics(
    {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "chapter",
      title: "Chapter",
      position: 1000,
      topicsCount: 1,
      completedTopicsCount: 0,
      firstIncompleteTopicId: "22222222-2222-4222-8222-222222222222",
      firstIncompleteTopicSlug: "topic",
    },
    [
      {
        id: "22222222-2222-4222-8222-222222222222",
        slug: "topic",
        title: "Topic",
        content: EMPTY_RICH_TEXT,
        completed: false,
        position: 1000,
      },
    ],
  );

  expect(fetch).toHaveBeenCalledTimes(1);
  expect(String(fetch.mock.calls[0][0])).toContain(
    "/rpc/create_chapter_with_topics",
  );
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    target_module_id: "module",
    new_chapter: {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "chapter",
      title: "Chapter",
      position: 1000,
    },
    new_topics: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        slug: "topic",
        title: "Topic",
        content: EMPTY_RICH_TEXT,
        completed: false,
        position: 1000,
      },
    ],
  });
});
it("sends note content in an RPC body and rejects a stale write", async () => {
  const { fetch, repository } = setup(false);
  const original = {
    type: "doc",
    content: [{ type: "paragraph", text: "x".repeat(50_000) }],
  };
  await expect(
    repository.updateTopicContent(
      "chapter",
      "topic",
      { type: "doc" },
      original,
    ),
  ).rejects.toThrow("innej karcie");
  const url = new URL(fetch.mock.calls[0][0]);
  expect(url.pathname).toContain("/rpc/save_topic_content");
  expect(url.toString().length).toBeLessThan(200);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    target_chapter_id: "chapter",
    target_topic_id: "topic",
    new_content: { type: "doc" },
    expected_content: original,
  });
});

it("loads summaries and navigation with module-scoped RPCs", async () => {
  const { fetch, repository } = setup([]);
  await repository.listChapters();
  await repository.getLearningSummary().catch(() => undefined);
  await repository.getTopicNavigation("topic").catch(() => undefined);

  expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
    expect.stringContaining("/rpc/get_chapter_summaries"),
    expect.stringContaining("/rpc/get_learning_summary"),
    expect.stringContaining("/rpc/get_topic_navigation"),
  ]);
  for (const [, init] of fetch.mock.calls) {
    expect(JSON.parse(init.body).target_module_id).toBe("module");
  }
});

it("requests only offline changes newer than the server cursor", async () => {
  const response = {
    serverTime: "2026-09-21T12:00:00Z",
    module: { id: "module" },
    chapters: [],
    topics: [],
    activeChapterIds: [],
    activeTopicIds: [],
    images: [],
  };
  const { fetch, repository } = setup(response);

  await repository.getOfflineChanges("2026-09-20T12:00:00Z", true);

  expect(String(fetch.mock.calls[0][0])).toContain(
    "/rpc/get_offline_module_changes",
  );
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    target_module_id: "module",
    changed_since: "2026-09-20T12:00:00Z",
    include_images: true,
  });
});
