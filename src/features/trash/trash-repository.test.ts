import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import { TrashRepository } from "./trash-repository";

it("returns one trash page and creates a stable cursor", async () => {
  const rows = [
    trashRow("trash-1", "2026-09-15T09:00:00.000Z"),
    trashRow("trash-2", "2026-09-15T08:00:00.000Z"),
    trashRow("trash-3", "2026-09-15T07:00:00.000Z"),
  ];
  const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
  const repository = new TrashRepository({
    rpc,
  } as unknown as SupabaseClient<Database>);

  const page = await repository.listPage(null, 2);

  expect(page.items.map((item) => item.id)).toEqual(["trash-1", "trash-2"]);
  expect(page.totalCount).toBe(12);
  expect(page.nextCursor).toEqual({
    deletedAt: "2026-09-15T08:00:00.000Z",
    id: "trash-2",
  });
  expect(rpc).toHaveBeenCalledWith("list_trash_items_page", {
    page_cursor_deleted_at: null,
    page_cursor_id: null,
    requested_page_size: 2,
  });
});

it("restores a selected node from a trash tree", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  const repository = new TrashRepository({
    rpc,
  } as unknown as SupabaseClient<Database>);

  await repository.restoreNode("trash", {
    id: "chapter",
    type: "chapter",
  });

  expect(rpc).toHaveBeenCalledWith("restore_trash_node", {
    target_trash_id: "trash",
    target_node_type: "chapter",
    target_node_id: "chapter",
  });
});

function trashRow(id: string, deletedAt: string) {
  return {
    id,
    item_type: "module" as const,
    item_id: `module-${id}`,
    title: id,
    deleted_at: deletedAt,
    purge_after: "2026-09-16T09:00:00.000Z",
    source_path: [],
    tree: {
      id: `module-${id}`,
      type: "module",
      title: id,
      is_deleted: true,
      children: [],
    },
    total_count: 12,
  };
}
