import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router";

import { useAuth } from "@/features/auth";
import { supabase } from "@/lib/supabase/client";
import { SupabaseModulesRepository } from "../data/supabase-modules-repository";
import { ModulePicker } from "../module-picker";
import { forgetRecentModule, reconcileRecentModules } from "@/lib/memory-cache";
import type { Module } from "../data/modules-repository";

export function ModulesPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  const repository = useMemo(
    () => new SupabaseModulesRepository(supabase, userId ?? ""),
    [userId],
  );
  const handleModulesLoaded = useCallback(
    (modules: Module[]) => {
      if (userId) reconcileRecentModules(userId, modules);
    },
    [userId],
  );
  if (!user) return null;

  return (
    <ModulePicker
      repository={repository}
      cacheKey={`modules:${user.id}`}
      onLoaded={handleModulesLoaded}
      onDeleted={(module) => forgetRecentModule(user.id, module.id)}
      onSelect={(module) =>
        navigate(`/${module.slug}`, { state: { moduleId: module.id } })
      }
    />
  );
}
