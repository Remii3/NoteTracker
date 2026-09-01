import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AccountDialog, getUserDisplayName, useAuth } from "@/features/auth";
import { supabase } from "@/lib/supabase/client";
import { R2TopicImagesService } from "./data/r2-topic-images-service";
import { SupabaseNotesRepository } from "./data/supabase-notes-repository";
import { NoteWorkspace } from "./note-workspace";
import { SupabaseQuestionsRepository } from "@/features/questions/data/supabase-questions-repository";
import { useNavigate, useParams } from "react-router";
import { ModulePicker } from "@/features/modules/module-picker";
import type { Module } from "@/features/modules/data/modules-repository";
import { SupabaseModulesRepository } from "@/features/modules/data/supabase-modules-repository";
import { AppLoading } from "@/components/app-loading";

export function SupabaseNoteWorkspace() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { moduleId } = useParams<{ moduleId: string }>();
  const [accountOpen, setAccountOpen] = useState(false);
  const [loadedModule, setLoadedModule] = useState<Module | null>(null);
  const modulesRepository = useMemo(
    () => new SupabaseModulesRepository(supabase, user?.id ?? ""),
    [user?.id],
  );
  useEffect(() => {
    if (!moduleId) return;
    void modulesRepository.get(moduleId).then((module) => {
      if (!module) navigate("/modules", { replace: true });
      setLoadedModule(module);
    });
  }, [moduleId, modulesRepository, navigate]);
  const selectedModule = loadedModule?.id === moduleId ? loadedModule : null;
  const repository = useMemo(
    () =>
      new SupabaseNotesRepository(
        supabase,
        user?.id ?? "",
        selectedModule?.id ?? "",
      ),
    [selectedModule?.id, user?.id],
  );
  const questionsRepository = useMemo(
    () =>
      new SupabaseQuestionsRepository(
        supabase,
        user?.id ?? "",
        selectedModule?.id ?? "",
      ),
    [selectedModule?.id, user?.id],
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
  if (!moduleId) {
    return (
      <ModulePicker
        repository={modulesRepository}
        imagesService={imagesService}
        onSelect={(module) => navigate(`/modules/${module.id}`)}
        onSignOut={() => void signOut()}
      />
    );
  }
  if (!selectedModule) return <AppLoading />;

  return (
    <>
      <NoteWorkspace
        key={`${user.id}:${moduleId}`}
        repository={repository}
        imagesService={imagesService}
        questionsRepository={questionsRepository}
        modulesRepository={modulesRepository}
        initialChapters={[]}
        loadOnMount
        userName={getUserDisplayName(user)}
        userEmail={user.email}
        moduleName={selectedModule.name}
        onOpenModules={() => navigate("/modules")}
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
