import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AccountDialog, getUserDisplayName, useAuth } from "@/features/auth";
import { supabase } from "@/lib/supabase/client";
import { R2TopicImagesService } from "./data/r2-topic-images-service";
import { SupabaseNotesRepository } from "./data/supabase-notes-repository";
import { NoteWorkspace } from "./note-workspace";
import { SupabaseQuestionsRepository } from "@/features/questions/data/supabase-questions-repository";
import { useNavigate } from "react-router";

export function SupabaseNoteWorkspace() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [accountOpen, setAccountOpen] = useState(false);
  const repository = useMemo(
    () => new SupabaseNotesRepository(supabase, user?.id ?? ""),
    [user?.id],
  );
  const questionsRepository = useMemo(
    () => new SupabaseQuestionsRepository(supabase, user?.id ?? ""),
    [user?.id],
  );
  const imagesApiUrl = import.meta.env.VITE_R2_IMAGES_API_URL as
    string | undefined;
  const imagesService = useMemo(
    () =>
      imagesApiUrl
        ? new R2TopicImagesService(supabase, imagesApiUrl.replace(/\/$/, ""))
        : undefined,
    [imagesApiUrl],
  );

  if (!user) return null;

  return (
    <>
      <NoteWorkspace
        key={user.id}
        repository={repository}
        imagesService={imagesService}
        questionsRepository={questionsRepository}
        initialChapters={[]}
        loadOnMount
        userName={getUserDisplayName(user)}
        userEmail={user.email}
        onOpenAccount={() => setAccountOpen(true)}
        onSignOut={() => {
          void signOut()
            .then(() => navigate("/"))
            .catch((error: unknown) => {
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
