import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AccountDialog, getUserDisplayName, useAuth } from "@/features/auth";
import { supabase } from "@/lib/supabase/client";
import { R2TopicImagesService } from "../data/r2-topic-images-service";
import { SupabaseNotesRepository } from "../data/supabase-notes-repository";
import { SupabaseQuestionsRepository } from "@/features/questions/data/supabase-questions-repository";
import { useLocation, useNavigate, useParams } from "react-router";
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
import { AppLoading } from "@/components/app-loading";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ModulePage() {
  const { user, signOut } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  const location = useLocation();
  const { moduleSlug } = useParams<{ moduleSlug: string }>();
  const navigationState = location.state as { moduleId?: unknown } | null;
  const routedModuleId =
    typeof navigationState?.moduleId === "string"
      ? navigationState.moduleId
      : undefined;
  const [accountOpen, setAccountOpen] = useState(false);
  const modulesCacheKey = `modules:${userId ?? "anonymous"}`;
  const cachedModule = moduleSlug
    ? readMemoryCache<Module[]>(modulesCacheKey)?.find(
        (module) =>
          module.id === routedModuleId ||
          module.slug === moduleSlug ||
          module.id === moduleSlug,
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
    if (!moduleSlug) return null;
    const loadedModule = routedModuleId
      ? await modulesRepository.get(routedModuleId)
      : UUID_PATTERN.test(moduleSlug)
        ? await modulesRepository.get(moduleSlug)
        : await modulesRepository.getBySlug(moduleSlug);
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
    }
    return loadedModule;
  }, [moduleSlug, modulesCacheKey, modulesRepository, routedModuleId]);
  const moduleResource = useAsyncResource(loadModule, {
    initialValue: cachedModule,
  });
  const selectedModule = moduleResource.value;
  const moduleId = selectedModule?.id;

  useEffect(() => {
    if (!selectedModule || selectedModule.slug === moduleSlug) return;
    navigate(
      {
        pathname: location.pathname.replace(
          /^\/[^/]+/,
          `/${selectedModule.slug}`,
        ),
        search: location.search,
        hash: location.hash,
      },
      { replace: true, state: { moduleId: selectedModule.id } },
    );
  }, [
    location.hash,
    location.pathname,
    location.search,
    moduleSlug,
    navigate,
    selectedModule,
  ]);

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

  if (!user || !moduleSlug) return null;
  if (moduleResource.loading && !selectedModule) return <AppLoading />;
  if (moduleResource.failed || (!moduleResource.loading && !selectedModule))
    return (
      <LoadError
        message={
          moduleResource.failed
            ? "Nie udało się pobrać modułu."
            : "Moduł nie istnieje lub jest niedostępny."
        }
        onRetry={moduleResource.retry}
        onBack={() => navigate("/")}
      />
    );

  return (
    <>
      <ModuleProvider
        moduleId={moduleId ?? ""}
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
        onOpenModules={() => navigate("/")}
        onOpenAccount={() => setAccountOpen(true)}
        onSignOut={handleSignOut}
      />
      {accountOpen && <AccountDialog onClose={() => setAccountOpen(false)} />}
    </>
  );
}
