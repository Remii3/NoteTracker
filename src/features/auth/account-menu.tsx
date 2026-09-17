import { LoaderCircle, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { clearUserMemoryCache } from "@/lib/memory-cache";
import { toast } from "@/components/ui/toast";
import { useAuth } from "./auth-context";
import { useState } from "react";
import { useSidebar } from "@/components/ui/sidebar";

type Props = {
  userName?: string;
  userEmail?: string;
  onOpenAccount: () => void;
};

export function AccountMenu({ userName, userEmail, onOpenAccount }: Props) {
  const { signOut, user } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const initial = (userName?.[0] ?? userEmail?.[0] ?? "U").toLocaleUpperCase(
    "pl",
  );

  function handleOpenAccount() {
    if (isMobile) setOpenMobile(false);
    onOpenAccount();
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut();
      if (user) clearUserMemoryCache(user.id);
    } catch {
      toast.add({
        data: { type: "error" },
        description: "Nie udało się wylogować. Spróbuj ponownie.",
      });
      setIsSigningOut(false);
    }
  }

  return (
    <div className="flex w-full items-center justify-between gap-2">
      <Button
        type="button"
        variant="ghost"
        className="group h-auto min-w-0 flex-1 justify-start gap-3 px-2 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-sidebar-ring/70"
        aria-label="Przejdź do ustawień konta"
        onClick={handleOpenAccount}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-5">
            {userName ?? "Użytkownik"}
          </span>
          <span className="block truncate text-xs font-normal leading-4 text-muted-foreground">
            {userEmail ?? "konto prywatne"}
          </span>
        </span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label={isSigningOut ? "Wylogowywanie…" : "Wyloguj"}
        title="Wyloguj"
        disabled={isSigningOut}
        onClick={() => void handleSignOut()}
        className={"h-full aspect-square"}
      >
        {isSigningOut ? <LoaderCircle className="animate-spin" /> : <LogOut />}
      </Button>
    </div>
  );
}
