import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AccountDialog, getUserDisplayName, useAuth } from "@/features/auth";
import { supabase } from "@/lib/supabase/client";
import { SupabaseNotesRepository } from "./data/supabase-notes-repository";
import { NoteWorkspace } from "./note-workspace";

export function SupabaseNoteWorkspace() {
  const { user, signOut } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const repository = useMemo(
    () => new SupabaseNotesRepository(supabase, user?.id ?? ""),
    [user?.id],
  );

  if (!user) return null;

  return (
    <>
      <NoteWorkspace
        key={user.id}
        repository={repository}
        initialChapters={[]}
        loadOnMount
        userName={getUserDisplayName(user)}
        userEmail={user.email}
        onOpenAccount={() => setAccountOpen(true)}
        onSignOut={() => {
          void signOut().catch((error: unknown) => {
            toast.error(
              error instanceof Error
                ? error.message
                : "Nie udało się wylogować.",
            );
          });
        }}
      />
      {accountOpen && <AccountDialog onClose={() => setAccountOpen(false)} />}
    </>
  );
}
