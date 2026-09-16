import { useState, type CSSProperties, type ReactNode } from "react";
import {
  Sidebar,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { AppHeader } from "@/layout/app-header";
import { AppHeaderActionsProvider } from "@/layout/app-header-actions";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/features/theme";

type AppLayoutProps = {
  accountMenu: ReactNode;
  children: ReactNode;
  header?: ReactNode;
  onOpenHome: () => void;
  overlay?: ReactNode;
  sidebar: ReactNode;
};

export function AppLayout({
  accountMenu,
  children,
  header,
  onOpenHome,
  overlay,
  sidebar,
}: AppLayoutProps) {
  const [headerActionsTarget, setHeaderActionsTarget] =
    useState<HTMLDivElement | null>(null);

  return (
    <TooltipProvider>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "clamp(17rem, 25vw, 20rem)",
          } as CSSProperties
        }
      >
        <Sidebar
          side="left"
          collapsible="offcanvas"
          className="[&_a]:cursor-default [&_button]:cursor-default"
        >
          <AppSidebarHeader onOpenHome={onOpenHome} />
          {sidebar}
          <SidebarFooter className="min-h-16 shrink-0 justify-center border-t p-2">
            {accountMenu}
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <AppHeaderActionsProvider target={headerActionsTarget}>
          <SidebarInset className="h-svh max-h-svh min-w-0 overflow-hidden">
            <AppHeader>
              {header}
              <div
                ref={setHeaderActionsTarget}
                className="flex min-w-0 items-center gap-2 sm:gap-3"
              />
            </AppHeader>
            {children}
          </SidebarInset>
        </AppHeaderActionsProvider>
        {overlay}
      </SidebarProvider>
    </TooltipProvider>
  );
}

function AppSidebarHeader({ onOpenHome }: { onOpenHome: () => void }) {
  const { isMobile, setOpenMobile } = useSidebar();

  const handleOpenHome = () => {
    onOpenHome();
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarHeader className="h-14 shrink-0 flex-row items-center justify-between border-b px-2 py-0">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              className="min-w-0 justify-start px-2 font-semibold focus-visible:ring-2 focus-visible:ring-ring/70"
              aria-label="Przejdź do modułów"
              onClick={handleOpenHome}
            />
          }
        >
          <BookOpen className="text-primary" />
          <span className="truncate">NoteTracker</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">Przejdź do modułów</TooltipContent>
      </Tooltip>
      <ThemeToggle />
    </SidebarHeader>
  );
}
