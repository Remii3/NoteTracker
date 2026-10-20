import { Navigate } from "react-router";
import { useCallback, useMemo } from "react";

import { AppLoading } from "@/components/app-loading";
import { useUser } from "@/features/auth";
import { SupabaseModulesRepository } from "@/features/modules/data/supabase-modules-repository";
import { TodayPage } from "@/features/today/pages/today-page";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { supabase } from "@/lib/supabase/client";
import { isOnboardingDismissed } from "../lib/onboarding-storage";

export function StartPage() {
  const user = useUser();
  const repository = useMemo(
    () => new SupabaseModulesRepository(supabase, user.id),
    [user.id],
  );
  const load = useCallback(() => repository.listPage("", 0, 1), [repository]);
  const modules = useAsyncResource(load);

  if (modules.loading) return <AppLoading />;
  if (
    modules.value &&
    modules.value.modules.length === 0 &&
    !isOnboardingDismissed(user.id)
  ) {
    return <Navigate to="/welcome" replace />;
  }
  return <TodayPage />;
}
