import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { useAuth } from "@/features/auth";
import { clearUserMemoryCache } from "@/lib/memory-cache";
import { supabase } from "@/lib/supabase/client";
import { SupabaseModulesRepository } from "../data/supabase-modules-repository";
import { ModulePicker } from "../module-picker";

export function ModulesPage() {
  const { user, signOut } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  const repository = useMemo(
    () => new SupabaseModulesRepository(supabase, userId ?? ""),
    [userId],
  );
  const handleSignOut = useCallback(() => {
    void signOut()
      .then(() => {
        if (userId) clearUserMemoryCache(userId);
        navigate("/");
      })
      .catch(() => {
        toast.error("Nie udało się wylogować. Spróbuj ponownie.");
      });
  }, [navigate, signOut, userId]);

  if (!user) return null;

  return (
    <ModulePicker
      repository={repository}
      cacheKey={`modules:${user.id}`}
      onSelect={(module) =>
        navigate(`/${module.slug}`, { state: { moduleId: module.id } })
      }
      onOpenTrash={() => navigate("/trash")}
      onOpenStatistics={() => navigate("/statistics")}
      onSignOut={handleSignOut}
    />
  );
}
