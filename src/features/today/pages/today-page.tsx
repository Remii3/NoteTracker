import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { useUser } from "@/features/auth";
import { supabase } from "@/lib/supabase/client";
import { SupabaseTodayRepository } from "../data/supabase-today-repository";
import { TodayDashboardPage } from "../components/today-dashboard-page";

export function TodayPage() {
  const user = useUser();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const repository = useMemo(
    () => new SupabaseTodayRepository(supabase, user.id),
    [user.id],
  );
  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  return (
    <TodayDashboardPage
      key={refreshKey}
      repository={repository}
      userName={
        typeof user.user_metadata.name === "string"
          ? user.user_metadata.name
          : null
      }
      onChanged={refresh}
      onNavigate={navigate}
    />
  );
}
