import { LogOut, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  userName?: string;
  userEmail?: string;
  onOpenAccount: () => void;
  onSignOut: () => void;
};

export function AccountMenu({
  userName,
  userEmail,
  onOpenAccount,
  onSignOut,
}: Props) {
  const initial = (userName?.[0] ?? userEmail?.[0] ?? "U").toLocaleUpperCase(
    "pl",
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className="h-auto w-full min-w-0 justify-start gap-3 px-2 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-sidebar-ring/70"
            aria-label="Otwórz menu konta"
          />
        }
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
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onClick={onOpenAccount}>
          <Settings /> Ustawienia konta
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onSignOut}>
          <LogOut /> Wyloguj
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
