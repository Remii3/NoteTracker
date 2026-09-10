import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import { SupabaseStatisticsRepository } from "./supabase-statistics-repository";

it("returns one topic page and builds the cursor from the last visible row", async () => {
  const rows = [
    topicRow("topic-1", 1000),
    topicRow("topic-2", 2000),
    topicRow("topic-3", 3000),
  ];
  const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
  const repository = new SupabaseStatisticsRepository(
    { rpc } as unknown as SupabaseClient<Database>,
    "user",
  );

  const page = await repository.getTopicsPage({
    moduleId: "module",
    sort: "chapter",
    cursor: null,
    pageSize: 2,
  });

  expect(page.items.map((item) => item.id)).toEqual(["topic-1", "topic-2"]);
  expect(page.nextCursor).toEqual({
    sortRank: 0,
    chapterPosition: 1000,
    topicPosition: 2000,
    topicId: "topic-2",
  });
  expect(rpc).toHaveBeenCalledWith(
    "get_progress_topics_page",
    expect.objectContaining({
      target_module_id: "module",
      sort_mode: "chapter",
      page_size: 2,
    }),
  );
});

function topicRow(id: string, position: number) {
  return {
    topic_id: id,
    chapter_id: "chapter",
    chapter_title: "Rozdział",
    title: id,
    completed: false,
    first_completed_at: null,
    sort_rank: 0,
    chapter_position: 1000,
    topic_position: position,
  };
}
