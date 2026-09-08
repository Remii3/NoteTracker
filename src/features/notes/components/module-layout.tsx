import type { ComponentProps } from "react";
import { Outlet } from "react-router";

import { LoadError } from "@/components/load-error";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceHeader } from "./workspace-header";
import { WorkspaceSidebar } from "./workspace-sidebar";
import { WorkspaceDialogs } from "./workspace-dialogs";

type Props = {
  sidebar: ComponentProps<typeof WorkspaceSidebar>;
  header: ComponentProps<typeof WorkspaceHeader> | null;
  dialogs: ComponentProps<typeof WorkspaceDialogs>;
  isLoading: boolean;
  loadFailed: boolean;
  onRetry: () => void;
  onBack: () => void;
};

export function ModuleLayout({
  sidebar,
  header,
  dialogs,
  isLoading,
  loadFailed,
  onRetry,
  onBack,
}: Props) {
  return (
    <TooltipProvider>
      <SidebarProvider
        style={{ "--sidebar-width": "20rem" } as React.CSSProperties}
      >
        <WorkspaceSidebar {...sidebar} />
        <SidebarInset className="h-dvh max-h-dvh min-w-0 overflow-hidden">
          {header && <WorkspaceHeader {...header} />}
          {isLoading ? (
            <WorkspaceLoadingSkeleton />
          ) : loadFailed ? (
            <LoadError
              message="Nie udało się pobrać notatek."
              onRetry={onRetry}
              onBack={onBack}
            />
          ) : (
            <Outlet />
          )}
        </SidebarInset>
        <WorkspaceDialogs {...dialogs} />
      </SidebarProvider>
    </TooltipProvider>
  );
}

function WorkspaceLoadingSkeleton() {
  return (
    <main
      className="min-h-0 flex-1 overflow-hidden px-5 py-8 sm:px-8 lg:px-12 lg:py-12"
      role="status"
      aria-busy="true"
      aria-label="Ładowanie modułu"
    >
      <div className="mx-auto max-w-6xl space-y-8" aria-hidden="true">
        <div className="space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-64 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="rounded-xl border p-5">
              <Skeleton className="size-9 rounded-lg" />
              <Skeleton className="mt-5 h-4 w-2/3" />
              <Skeleton className="mt-2 h-7 w-1/3" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border p-6">
          <Skeleton className="h-5 w-40" />
          <div className="mt-5 space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-4/5" />
          </div>
        </div>
      </div>
    </main>
  );
}
