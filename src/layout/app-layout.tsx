import { useState, type ReactNode } from "react";
import {
  Sidebar,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";

import { AppHeader } from "@/layout/app-header";
import { AppHeaderActionsProvider } from "@/layout/app-header-actions";
import { BookOpen } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { InAppReviewReminder } from "@/features/preferences/components/in-app-review-reminder";
import { NavLink } from "react-router";

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
    <>
      <InAppReviewReminder />
      <SidebarProvider>
        <Sidebar>
          <AppSidebarHeader onOpenHome={onOpenHome} />
          {sidebar}
          <SidebarFooter className="border-t">{accountMenu}</SidebarFooter>
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
    </>
  );
}

function AppSidebarHeader({ onOpenHome }: { onOpenHome: () => void }) {
  const { isMobile, setOpenMobile } = useSidebar();

  const handleOpenHome = () => {
    onOpenHome();
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarHeader className="h-14 shrink-0 flex-row items-center border-b px-2 py-0">
      <NavLink
        to={"/"}
        className={`${buttonVariants({ variant: "ghost" })} "min-w-0 justify-start px-2 font-semibold focus-visible:ring-2 focus-visible:ring-ring/70"`}
        onClick={handleOpenHome}
      >
        <BookOpen className="text-primary" />
        <span className="truncate">NoteTracker</span>
      </NavLink>
    </SidebarHeader>
  );
}
