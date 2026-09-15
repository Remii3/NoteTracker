import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { throwIfPostgrestError } from "@/features/notes/data/supabase-error";

export type TrashItemType =
  Database["public"]["Tables"]["trash_items"]["Row"]["item_type"];

export type TrashTreeNode = {
  id: string;
  type: TrashItemType;
  title: string;
  is_deleted: boolean;
  children: TrashTreeNode[];
};

type TrashPageRow =
  Database["public"]["Functions"]["list_trash_items_page"]["Returns"][number];

export type TrashItem = Omit<TrashPageRow, "tree" | "total_count"> & {
  tree: TrashTreeNode;
};

export type TrashCursor = {
  deletedAt: string;
  id: string;
};

export type TrashPage = {
  items: TrashItem[];
  totalCount: number;
  nextCursor: TrashCursor | null;
};

export class TrashRepository {
  private readonly client: SupabaseClient<Database>;
  private readonly imagesApiUrl?: string;

  constructor(client: SupabaseClient<Database>, imagesApiUrl?: string) {
    this.client = client;
    this.imagesApiUrl = imagesApiUrl;
  }

  async listPage(
    cursor: TrashCursor | null = null,
    pageSize = 10,
  ): Promise<TrashPage> {
    const { data, error } = await this.client.rpc("list_trash_items_page", {
      page_cursor_deleted_at: cursor?.deletedAt ?? null,
      page_cursor_id: cursor?.id ?? null,
      requested_page_size: pageSize,
    });
    throwIfPostgrestError(error);
    const rows = data ?? [];
    const visibleRows = rows.slice(0, pageSize);
    const lastItem = visibleRows.at(-1);

    return {
      items: visibleRows.map((row) => ({
        id: row.id,
        item_type: row.item_type,
        item_id: row.item_id,
        title: row.title,
        deleted_at: row.deleted_at,
        purge_after: row.purge_after,
        source_path: row.source_path,
        tree: row.tree as unknown as TrashTreeNode,
      })),
      totalCount: Number(rows[0]?.total_count ?? 0),
      nextCursor:
        rows.length > pageSize && lastItem
          ? { deletedAt: lastItem.deleted_at, id: lastItem.id }
          : null,
    };
  }

  async restore(id: string) {
    const { error } = await this.client.rpc("restore_trash_item", {
      target_trash_id: id,
    });
    throwIfPostgrestError(error);
  }

  async restoreNode(trashId: string, node: Pick<TrashTreeNode, "id" | "type">) {
    const { error } = await this.client.rpc("restore_trash_node", {
      target_trash_id: trashId,
      target_node_type: node.type,
      target_node_id: node.id,
    });
    throwIfPostgrestError(error);
  }

  async purge(id: string) {
    if (!this.imagesApiUrl) throw new Error("Brakuje adresu usługi zdjęć.");
    const { data, error } = await this.client.auth.getSession();
    if (error || !data.session) throw new Error("Sesja wygasła.");
    const response = await fetch(
      `${this.imagesApiUrl.replace(/\/$/, "")}/trash/${id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      },
    );
    if (!response.ok) throw new Error("Nie udało się trwale usunąć elementu.");
  }
}
