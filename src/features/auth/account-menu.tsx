import { Settings } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  userName?: string;
  userEmail?: string;
  onOpenAccount: () => void;
};

export function AccountMenu({ userName, userEmail, onOpenAccount }: Props) {
  const initial = (userName?.[0] ?? userEmail?.[0] ?? "U").toLocaleUpperCase(
    "pl",
  );

  return (
    <Button
      type="button"
      variant="ghost"
      className="group h-auto w-full min-w-0 justify-start gap-3 px-2 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-sidebar-ring/70"
      aria-label="Przejdź do ustawień konta"
      onClick={onOpenAccount}
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
      <Settings className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
    </Button>
  );
}
