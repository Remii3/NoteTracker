import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { AccountDialog, getUserDisplayName, useAuth } from "@/features/auth";
import { supabase } from "@/lib/supabase/client";
import { R2TopicImagesService } from "../data/r2-topic-images-service";
import { SupabaseNotesRepository } from "../data/supabase-notes-repository";
import { SupabaseQuestionsRepository } from "@/features/questions/data/supabase-questions-repository";
import { useNavigate, useParams } from "react-router";
import type { Module } from "@/features/modules/data/modules-repository";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { LoadError } from "@/components/load-error";
import { SupabaseModulesRepository } from "@/features/modules/data/supabase-modules-repository";
import { SupabaseStatisticsRepository } from "@/features/statistics/data/supabase-statistics-repository";
import { ModuleProvider } from "../components/module-provider";
import {
  clearUserMemoryCache,
  readMemoryCache,
  writeMemoryCache,
} from "@/lib/memory-cache";

export function ModulePage() {
  const { user, signOut } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  const { moduleId } = useParams<{ moduleId: string }>();
  const [accountOpen, setAccountOpen] = useState(false);
  const modulesCacheKey = `modules:${userId ?? "anonymous"}`;
  const cachedModule = moduleId
    ? readMemoryCache<Module[]>(modulesCacheKey)?.find(
        (module) => module.id === moduleId,
      )
    : undefined;
  const modulesRepository = useMemo(
    () => new SupabaseModulesRepository(supabase, userId ?? ""),
    [userId],
  );
  const statisticsRepository = useMemo(
    () => new SupabaseStatisticsRepository(supabase, userId ?? ""),
    [userId],
  );
  const loadModule = useCallback(async () => {
    if (!moduleId) return null;
    const loadedModule = await modulesRepository.get(moduleId);
    if (loadedModule) {
      const cached = readMemoryCache<Module[]>(modulesCacheKey) ?? [];
      writeMemoryCache(
        modulesCacheKey,
        cached.some((module) => module.id === loadedModule.id)
          ? cached.map((module) =>
              module.id === loadedModule.id ? loadedModule : module,
            )
          : [...cached, loadedModule],
      );
    } else {
      const cached = readMemoryCache<Module[]>(modulesCacheKey);
      if (cached) {
        writeMemoryCache(
          modulesCacheKey,
          cached.filter((module) => module.id !== moduleId),
        );
      }
    }
    return loadedModule;
  }, [moduleId, modulesCacheKey, modulesRepository]);
  const moduleResource = useAsyncResource(loadModule, {
    initialValue: cachedModule,
  });
  const selectedModule = moduleResource.value;
  const handleSignOut = useCallback(() => {
    void signOut()
      .then(() => {
        if (userId) clearUserMemoryCache(userId);
        navigate("/");
      })
      .catch(() => {
        toast.error("Nie udało się wylogować. Spróbuj ponownie.");
      });
  }, [signOut, navigate, userId]);

  const repository = useMemo(
    () => new SupabaseNotesRepository(supabase, userId ?? "", moduleId ?? ""),
    [moduleId, userId],
  );
  const questionsRepository = useMemo(
    () =>
      new SupabaseQuestionsRepository(supabase, userId ?? "", moduleId ?? ""),
    [moduleId, userId],
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

  if (!user || !moduleId) return null;
  if (moduleResource.failed || (!moduleResource.loading && !selectedModule))
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
      <ModuleProvider
        key={`${user.id}:${moduleId}`}
        draftScope={`${user.id}:${moduleId}`}
        repository={repository}
        imagesService={imagesService}
        questionsRepository={questionsRepository}
        modulesRepository={modulesRepository}
        statisticsRepository={statisticsRepository}
        statisticsCacheScope={user.id}
        initialChapters={[]}
        loadOnMount
        userName={getUserDisplayName(user)}
        userEmail={user.email}
        moduleName={selectedModule?.name}
        moduleNameLoading={moduleResource.loading}
        onOpenModules={() => navigate("/modules")}
        onOpenAccount={() => setAccountOpen(true)}
        onSignOut={handleSignOut}
      />
      {accountOpen && <AccountDialog onClose={() => setAccountOpen(false)} />}
    </>
  );
}
