import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import { SupabaseModulesRepository } from "./supabase-modules-repository";

function moduleRow(id: string, name: string) {
  return {
    id,
    is_pinned: false,
    slug: id,
    name,
    module_position: 1000,
    chapters_count: 0,
    completed_chapters_count: 0,
    topics_count: 0,
    completed_topics_count: 0,
  };
}

it("searches module names by substring and requests one extra pagination row", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify([
          moduleRow("one", "Wasdg"),
          moduleRow("two", "Zasd"),
          moduleRow("three", "Żasd"),
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
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
  const repository = new SupabaseModulesRepository(client, "user");

  const page = await repository.listPage("asd", 0, 2);

  expect(page.modules.map((module) => module.name)).toEqual(["Wasdg", "Zasd"]);
  expect(page.hasMore).toBe(true);
  const url = new URL(fetch.mock.calls[0][0]);
  expect(url.pathname).toContain("/rpc/get_module_summaries");
  expect(url.searchParams.get("name")).toBe("ilike.%asd%");
  expect(url.searchParams.get("is_pinned")).toBe("eq.false");
  expect(url.searchParams.get("order")).toBe("name.asc,id.asc");
  expect(url.searchParams.get("offset")).toBe("0");
  expect(url.searchParams.get("limit")).toBe("3");
});

it("loads pinned modules independently from search and pagination", async () => {
  const pinned = { ...moduleRow("pinned", "Przypięty"), is_pinned: true };
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify([pinned]), {
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
  const repository = new SupabaseModulesRepository(client, "user");

  const modules = await repository.listPinned();

  expect(modules).toEqual([
    expect.objectContaining({ id: "pinned", isPinned: true }),
  ]);
  const url = new URL(fetch.mock.calls[0][0]);
  expect(url.searchParams.get("is_pinned")).toBe("eq.true");
  expect(url.searchParams.has("offset")).toBe(false);
  expect(url.searchParams.has("limit")).toBe(false);
});

it("updates pinning only for a module owned by the current user", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ id: "module" }), {
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
  const repository = new SupabaseModulesRepository(client, "user");

  await repository.setPinned("module", true);

  const url = new URL(fetch.mock.calls[0][0]);
  expect(url.pathname).toContain("/modules");
  expect(url.searchParams.get("id")).toBe("eq.module");
  expect(url.searchParams.get("user_id")).toBe("eq.user");
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ is_pinned: true });
});
