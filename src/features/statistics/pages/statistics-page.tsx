import { StatisticsPage as StatisticsDashboard } from "../components/statistics-page";
import { SupabaseStatisticsRepository } from "../data/supabase-statistics-repository";
import { supabase } from "@/lib/supabase/client";
import { useMemo } from "react";
import { useUser } from "@/features/auth";

export function StatisticsPage() {
  const user = useUser();
  const repository = useMemo(
    () => new SupabaseStatisticsRepository(supabase, user?.id ?? ""),
    [user?.id],
  );

  return (
    <StatisticsDashboard
      repository={repository}
      moduleId={null}
      cacheScope={user.id}
    />
  );
}
