import { useCallback, useEffect, useMemo } from "react";

import { getUserDisplayName, useAuth } from "@/features/auth";
import { supabase } from "@/lib/supabase/client";
import { R2TopicImagesService } from "../data/r2-topic-images-service";
import { SupabaseNotesRepository } from "../data/supabase-notes-repository";
import { SupabaseQuestionsRepository } from "@/features/questions/data/supabase-questions-repository";
import { OpenAiQuestionGenerationService } from "@/features/questions/data/openai-question-generation-service";
import { OpenAiSummaryGenerationService } from "@/features/summaries/data/openai-summary-generation-service";
import { useLocation, useNavigate, useParams } from "react-router";
import type { Module } from "@/features/modules/data/modules-repository";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { LoadError } from "@/components/load-error";
import { SupabaseModulesRepository } from "@/features/modules/data/supabase-modules-repository";
import { SupabaseStatisticsRepository } from "@/features/statistics/data/supabase-statistics-repository";
import { ModuleProvider } from "../components/module-provider";
import { OfflineModuleService } from "../offline/offline-module-service";
import { OfflineNotesRepository } from "../data/offline-notes-repository";
import { OfflineTopicImagesService } from "../data/offline-topic-images-service";
import {
  readMemoryCache,
  rememberRecentModule,
  updateRecentModuleProgress,
  writeMemoryCache,
} from "@/lib/memory-cache";
import { AppLoading } from "@/components/app-loading";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ModulePage() {
  const { user } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  const location = useLocation();
  const { moduleSlug } = useParams<{ moduleSlug: string }>();
  const navigationState = location.state as { moduleId?: unknown } | null;
  const routedModuleId =
    typeof navigationState?.moduleId === "string"
      ? navigationState.moduleId
      : undefined;
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
  const imagesApiUrl = import.meta.env.VITE_R2_IMAGES_API_URL as
    string | undefined;
  const onlineImagesService = useMemo(
    () =>
      imagesApiUrl
        ? new R2TopicImagesService(supabase, imagesApiUrl.replace(/\/$/, ""))
        : undefined,
    [imagesApiUrl],
  );
  const offlineService = useMemo(
    () =>
      new OfflineModuleService(
        userId ?? "",
        (id) => new SupabaseNotesRepository(supabase, userId ?? "", id),
        onlineImagesService,
      ),
    [onlineImagesService, userId],
  );
  const statisticsRepository = useMemo(
    () => new SupabaseStatisticsRepository(supabase, userId ?? ""),
    [userId],
  );
  const loadModule = useCallback(async () => {
    if (!moduleSlug) return null;
    let loadedModule: Module | null = null;
    let requestFailed = false;
    try {
      loadedModule = routedModuleId
        ? await modulesRepository.get(routedModuleId)
        : UUID_PATTERN.test(moduleSlug)
          ? await modulesRepository.get(moduleSlug)
          : await modulesRepository.getBySlug(moduleSlug);
    } catch {
      requestFailed = true;
      // A persisted module remains usable when connectivity detection lags.
    }
    if (
      !loadedModule &&
      (requestFailed || (typeof navigator !== "undefined" && !navigator.onLine))
    ) {
      const offline = await offlineService.find(routedModuleId ?? moduleSlug);
      loadedModule = offline?.module ?? null;
    }
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
  }, [
    moduleSlug,
    modulesCacheKey,
    modulesRepository,
    offlineService,
    routedModuleId,
  ]);
  const moduleResource = useAsyncResource(loadModule, {
    initialValue: cachedModule,
  });
  const selectedModule = moduleResource.value;
  const moduleId = selectedModule?.id;

  const handleModuleProgressChange = useCallback(
    ({
      completedTopicsCount,
      topicsCount,
    }: {
      completedTopicsCount: number;
      topicsCount: number;
    }) => {
      if (!userId || !moduleId) return;
      updateRecentModuleProgress(
        userId,
        moduleId,
        completedTopicsCount,
        topicsCount,
      );
      const cached = readMemoryCache<Module[]>(modulesCacheKey);
      if (cached)
        writeMemoryCache(
          modulesCacheKey,
          cached.map((module) =>
            module.id === moduleId
              ? { ...module, completedTopicsCount, topicsCount }
              : module,
          ),
        );
    },
    [moduleId, modulesCacheKey, userId],
  );

  useEffect(() => {
    if (selectedModule && userId) rememberRecentModule(userId, selectedModule);
  }, [selectedModule, userId]);

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

  const repository = useMemo(() => {
    const online = new SupabaseNotesRepository(
      supabase,
      userId ?? "",
      moduleId ?? "",
    );
    return new OfflineNotesRepository(online, moduleId ?? "", offlineService);
  }, [moduleId, offlineService, userId]);
  const imagesService = useMemo(
    () =>
      onlineImagesService && userId
        ? new OfflineTopicImagesService(
            onlineImagesService,
            userId,
            offlineService,
            moduleId ?? "",
          )
        : undefined,
    [moduleId, offlineService, onlineImagesService, userId],
  );
  const questionsRepository = useMemo(
    () =>
      new SupabaseQuestionsRepository(supabase, userId ?? "", moduleId ?? ""),
    [moduleId, userId],
  );
  const questionGeneratorApiUrl = import.meta.env
    .VITE_QUESTION_GENERATOR_API_URL as string | undefined;
  const questionGenerationService = useMemo(
    () =>
      questionGeneratorApiUrl
        ? new OpenAiQuestionGenerationService(
            supabase,
            questionGeneratorApiUrl.replace(/\/$/, ""),
          )
        : undefined,
    [questionGeneratorApiUrl],
  );
  const summaryGenerationService = useMemo(
    () =>
      questionGeneratorApiUrl
        ? new OpenAiSummaryGenerationService(
            supabase,
            questionGeneratorApiUrl.replace(/\/$/, ""),
          )
        : undefined,
    [questionGeneratorApiUrl],
  );

  useEffect(() => {
    if (!moduleId || !navigator.onLine) return;
    const sync = () =>
      void offlineService.syncStored(moduleId).catch(() => undefined);
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [moduleId, offlineService]);

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
    <ModuleProvider
      moduleId={moduleId ?? ""}
      key={`${user.id}:${moduleId}`}
      draftScope={`${user.id}:${moduleId}`}
      repository={repository}
      imagesService={imagesService}
      questionsRepository={questionsRepository}
      questionGenerationService={questionGenerationService}
      summaryGenerationService={summaryGenerationService}
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
      onModuleProgressChange={handleModuleProgressChange}
    />
  );
}
