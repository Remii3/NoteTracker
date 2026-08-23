import { useMemo } from "react";
import { toast } from "sonner";

import { getUserDisplayName, useAuth } from "@/features/auth";
import { supabase } from "@/lib/supabase/client";
import { SupabaseNotesRepository } from "./data/supabase-notes-repository";
import { NoteWorkspace } from "./note-workspace";

export function SupabaseNoteWorkspace() {
  const { user, signOut } = useAuth();
  const repository = useMemo(
    () => new SupabaseNotesRepository(supabase, user?.id ?? ""),
    [user?.id],
  );

  if (!user) return null;

  return (
    <NoteWorkspace
      key={user.id}
      repository={repository}
      initialChapters={[]}
      loadOnMount
      userName={getUserDisplayName(user)}
      userEmail={user.email}
      onSignOut={() => {
        void signOut().catch((error: unknown) => {
          toast.error(
            error instanceof Error ? error.message : "Nie udało się wylogować.",
          );
        });
      }}
    />
  );
}
