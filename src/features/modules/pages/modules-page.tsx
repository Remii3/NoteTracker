import { forgetRecentModule, reconcileRecentModules } from "@/lib/memory-cache";
import { useCallback, useMemo } from "react";

import type { Module } from "../data/modules-repository";
import { ModulePicker } from "../module-picker";
import { R2TopicImagesService } from "@/features/notes/data/r2-topic-images-service";
import { SupabaseModulesRepository } from "../data/supabase-modules-repository";
import { supabase } from "@/lib/supabase/client";
import { useNavigate } from "react-router";
import { useUser } from "@/features/auth";

export function ModulesPage() {
  const user = useUser();
  const userId = user.id;
  const navigate = useNavigate();
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
  const handleModulesLoaded = useCallback(
    (modules: Module[]) => {
      if (userId) reconcileRecentModules(userId, modules);
    },
    [userId],
  );

  return (
    <ModulePicker
      repository={repository}
      imagesService={imagesService}
      cacheKey={`modules:${user.id}`}
      onLoaded={handleModulesLoaded}
      onDeleted={(module) => forgetRecentModule(user.id, module.id)}
      onSelect={(module) =>
        navigate(`/${module.slug}`, { state: { moduleId: module.id } })
      }
    />
  );
}
