import { forgetRecentModule, reconcileRecentModules } from "@/lib/memory-cache";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { Module } from "../data/modules-repository";
import { ModulePicker } from "../module-picker";
import { R2TopicImagesService } from "@/features/notes/data/r2-topic-images-service";
import { SupabaseModulesRepository } from "../data/supabase-modules-repository";
import { supabase } from "@/lib/supabase/client";
import { useNavigate, useSearchParams } from "react-router";
import { SpotlightGuide } from "@/features/onboarding/components/spotlight-guide";
import { dismissOnboarding } from "@/features/onboarding/lib/onboarding-storage";
import { useUser } from "@/features/auth";
import { OfflineModuleService } from "@/features/notes/offline/offline-module-service";
import { SupabaseNotesRepository } from "@/features/notes/data/supabase-notes-repository";

export function ModulesPage() {
  const user = useUser();
  const userId = user.id;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedAction = searchParams.get("onboarding");
  const onboardingAction =
    requestedAction === "create" || requestedAction === "import"
      ? requestedAction
      : undefined;
  const [showGuide, setShowGuide] = useState(Boolean(onboardingAction));
  const repository = useMemo(
    () => new SupabaseModulesRepository(supabase, userId ?? ""),
    [userId],
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
  const offlineService = useMemo(
    () =>
      new OfflineModuleService(
        userId,
        (moduleId) => new SupabaseNotesRepository(supabase, userId, moduleId),
        imagesService,
      ),
    [imagesService, userId],
  );

  useEffect(() => {
    const sync = async () => {
      if (!navigator.onLine) return;
      const snapshots = await offlineService.list();
      for (const snapshot of snapshots)
        await offlineService
          .syncStored(snapshot.module.id)
          .catch(() => undefined);
    };
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [offlineService]);
  const handleModulesLoaded = useCallback(
    (modules: Module[]) => {
      if (userId) reconcileRecentModules(userId, modules);
    },
    [userId],
  );

  return (
    <>
      <ModulePicker
        repository={repository}
        imagesService={imagesService}
        offlineService={offlineService}
        cacheKey={`modules:${user.id}`}
        onLoaded={handleModulesLoaded}
        onDeleted={(module) => forgetRecentModule(user.id, module.id)}
        onSelect={(module) =>
          navigate(`/${module.slug}`, { state: { moduleId: module.id } })
        }
        onOnboardingFinished={
          onboardingAction
            ? (module) => {
                setShowGuide(false);
                const destination =
                  onboardingAction === "import"
                    ? `/${module.slug}/questions?onboarding=questions`
                    : `/${module.slug}?onboarding=content`;
                navigate(destination, {
                  replace: true,
                  state: { moduleId: module.id },
                });
              }
            : undefined
        }
      />
      {showGuide && onboardingAction && (
        <SpotlightGuide
          target={`[data-onboarding="${onboardingAction}-module"]`}
          title={
            onboardingAction === "import"
              ? "Zaimportuj swoje materiały"
              : "Utwórz pierwszy moduł"
          }
          description={
            onboardingAction === "import"
              ? "Wybierz plik lub źródło. Przed zapisaniem zobaczysz podgląd importu."
              : "Moduł to przedmiot lub większy obszar nauki, na przykład Anatomia."
          }
          step={1}
          steps={4}
          onSkip={() => {
            dismissOnboarding(user.id);
            setShowGuide(false);
            navigate("/modules", { replace: true });
          }}
        />
      )}
    </>
  );
}
