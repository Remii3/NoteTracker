import { useState, type ReactNode } from "react";
import {
  Sidebar,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

import { AppHeaderActionsProvider } from "@/layout/app-header-actions";
import { BookOpen } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { InAppReviewReminder } from "@/features/preferences/components/in-app-review-reminder";
import { AccountSettingsSheet } from "@/features/auth/account-settings-sheet";
import { NavLink } from "react-router";

type AppLayoutProps = {
  accountMenu: (onOpenAccount: () => void) => ReactNode;
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
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);

  return (
    <>
      <InAppReviewReminder />
      <SidebarProvider>
        <Sidebar>
          <AppSidebarHeader onOpenHome={onOpenHome} />
          {sidebar}
          <SidebarFooter className="border-t">
            {accountMenu(() => setAccountSettingsOpen(true))}
          </SidebarFooter>
        </Sidebar>
        <AppHeaderActionsProvider target={headerActionsTarget}>
          <SidebarInset className="h-svh max-h-svh min-w-0 overflow-hidden">
            <header className="relative z-30 flex h-14 shrink-0 items-center border-b bg-background/95 px-2 backdrop-blur sm:px-6 justify-between">
              <SidebarTrigger className="shrink-0 focus-visible:ring-2 focus-visible:ring-ring/70 mr-2" />
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                {header}
                <div
                  ref={setHeaderActionsTarget}
                  className="flex min-w-0 items-center gap-2 sm:gap-3"
                />
              </div>
            </header>
            {children}
          </SidebarInset>
        </AppHeaderActionsProvider>
        {overlay}
        <AccountSettingsSheet
          open={accountSettingsOpen}
          onOpenChange={setAccountSettingsOpen}
        />
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
