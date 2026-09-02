import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { throwIfPostgrestError } from "@/features/notes/data/supabase-error";

export type TrashItem = Database["public"]["Tables"]["trash_items"]["Row"];

export class TrashRepository {
  private readonly client: SupabaseClient<Database>;
  private readonly userId: string;
  private readonly imagesApiUrl?: string;

  constructor(
    client: SupabaseClient<Database>,
    userId: string,
    imagesApiUrl?: string,
  ) {
    this.client = client;
    this.userId = userId;
    this.imagesApiUrl = imagesApiUrl;
  }

  async list() {
    const { data, error } = await this.client
      .from("trash_items")
      .select("id,user_id,item_type,item_id,title,deleted_at,purge_after")
      .eq("user_id", this.userId)
      .order("deleted_at", { ascending: false });
    throwIfPostgrestError(error);
    return data ?? [];
  }

  async restore(id: string) {
    const { error } = await this.client.rpc("restore_trash_item", {
      target_trash_id: id,
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
