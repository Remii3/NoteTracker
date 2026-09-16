import type { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center border-b bg-background/95 px-2 backdrop-blur sm:px-6 justify-between">
      <SidebarTrigger className="shrink-0 focus-visible:ring-2 focus-visible:ring-ring/70 mr-2" />
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">{children}</div>
    </header>
  );
}
