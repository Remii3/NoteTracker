import { useMemo } from "react";

import { useAuth } from "@/features/auth";
import { supabase } from "@/lib/supabase/client";
import { StatisticsPage as StatisticsDashboard } from "../components/statistics-page";
import { SupabaseStatisticsRepository } from "../data/supabase-statistics-repository";

export function StatisticsPage() {
  const { user } = useAuth();
  const repository = useMemo(
    () => new SupabaseStatisticsRepository(supabase, user?.id ?? ""),
    [user?.id],
  );

  if (!user) return null;

  return (
    <StatisticsDashboard
      repository={repository}
      moduleId={null}
      cacheScope={user.id}
    />
  );
}
