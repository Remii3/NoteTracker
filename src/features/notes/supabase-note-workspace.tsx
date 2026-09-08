import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { AccountDialog, getUserDisplayName, useAuth } from "@/features/auth";
import { supabase } from "@/lib/supabase/client";
import { R2TopicImagesService } from "./data/r2-topic-images-service";
import { SupabaseNotesRepository } from "./data/supabase-notes-repository";
import { NoteWorkspace } from "./note-workspace";
import { SupabaseQuestionsRepository } from "@/features/questions/data/supabase-questions-repository";
import { useNavigate, useParams } from "react-router";
import { ModulePicker } from "@/features/modules/module-picker";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { LoadError } from "@/components/load-error";
import { SupabaseModulesRepository } from "@/features/modules/data/supabase-modules-repository";
import { AppLoading } from "@/components/app-loading";

export function SupabaseNoteWorkspace() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { moduleId } = useParams<{ moduleId: string }>();
  const [accountOpen, setAccountOpen] = useState(false);
  const modulesRepository = useMemo(
    () => new SupabaseModulesRepository(supabase, user?.id ?? ""),
    [user?.id],
  );
  const loadModule = useCallback(
    () => (moduleId ? modulesRepository.get(moduleId) : Promise.resolve(null)),
    [moduleId, modulesRepository],
  );
  const moduleResource = useAsyncResource(loadModule);
  const selectedModule = moduleResource.value;
  const handleSignOut = useCallback(() => {
    void signOut()
      .then(() => navigate("/"))
      .catch(() => {
        toast.error("Nie udało się wylogować. Spróbuj ponownie.");
      });
  }, [signOut, navigate]);
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
        onSelect={(module) => navigate(`/modules/${module.id}`)}
        onOpenTrash={() => navigate("/trash")}
        onSignOut={handleSignOut}
      />
    );
  }
  if (moduleResource.loading) return <AppLoading />;
  if (moduleResource.failed || !selectedModule)
    return (
      <LoadError
        message={
          moduleResource.failed
            ? "Nie udało się pobrać modułu."
            : "Moduł nie istnieje lub jest niedostępny."
        }
        onRetry={moduleResource.retry}
        onBack={() => navigate("/modules")}
      />
    );

  return (
    <>
      <NoteWorkspace
        key={`${user.id}:${moduleId}`}
        draftScope={`${user.id}:${moduleId}`}
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
        onSignOut={handleSignOut}
      />
      {accountOpen && <AccountDialog onClose={() => setAccountOpen(false)} />}
    </>
  );
}
