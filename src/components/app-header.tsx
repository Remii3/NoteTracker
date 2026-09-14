import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Props = {
  children?: ReactNode;
  onOpenHome: () => void;
  onActionsTargetChange?: (target: HTMLDivElement | null) => void;
  onInfoTargetChange?: (target: HTMLDivElement | null) => void;
  onTrailingActionsTargetChange?: (target: HTMLDivElement | null) => void;
};

const HeaderActionsContext = createContext<HTMLElement | null>(null);
const HeaderInfoContext = createContext<HTMLElement | null>(null);
const HeaderTrailingActionsContext = createContext<HTMLElement | null>(null);

export function AppHeader({
  children,
  onActionsTargetChange,
  onInfoTargetChange,
  onTrailingActionsTargetChange,
  onOpenHome,
}: Props) {
  const { state } = useSidebar();

  return (
    <header className="relative z-30 flex h-14 shrink-0 border-b bg-background/95 backdrop-blur">
      <div
        className={cn(
          "hidden shrink-0 items-center overflow-hidden border-r transition-[width,padding] duration-200 motion-reduce:transition-none md:flex",
          state === "expanded" ? "w-(--sidebar-width) px-3" : "w-0 px-0",
        )}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                className="min-w-0 justify-start px-2 font-semibold focus-visible:ring-2 focus-visible:ring-ring/70"
                aria-label="Przejdź do modułów"
                onClick={onOpenHome}
              />
            }
          >
            <BookOpen className="text-primary" />
            <span className="truncate">NoteTracker</span>
          </TooltipTrigger>
          <TooltipContent side="bottom">Przejdź do modułów</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2 px-2 sm:gap-3 sm:px-6">
        <SidebarTrigger className="shrink-0 focus-visible:ring-2 focus-visible:ring-ring/70" />
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2 sm:gap-3">
          <div
            ref={onInfoTargetChange}
            className="min-w-0 flex-1 empty:hidden"
          />
          {children}
        </div>
        <div ref={onActionsTargetChange} className="hidden" />
        <div
          ref={onTrailingActionsTargetChange}
          className="flex shrink-0 items-center empty:hidden"
        />
      </div>
    </header>
  );
}

export function AppHeaderActions({ children }: { children: ReactNode }) {
  const target = useContext(HeaderActionsContext);
  return target
    ? createPortal(
        <div className="flex h-8 items-center gap-2 sm:gap-3 [&_[data-slot=button]]:h-8 [&_[data-slot=select-trigger]]:h-8">
          {children}
        </div>,
        target,
      )
    : null;
}

export function AppHeaderInfo({ children }: { children: ReactNode }) {
  const target = useContext(HeaderInfoContext);
  return target ? createPortal(children, target) : null;
}

export function AppHeaderTrailingActions({
  children,
}: {
  children: ReactNode;
}) {
  const target = useContext(HeaderTrailingActionsContext);
  return target ? createPortal(children, target) : null;
}

export function MobileAppSidebarHeader({
  onOpenHome,
}: Pick<Props, "onOpenHome">) {
  return (
    <div className="flex h-14 shrink-0 items-center border-b px-3 md:hidden">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              className="min-w-0 justify-start px-2 font-semibold focus-visible:ring-2 focus-visible:ring-ring/70"
              aria-label="Przejdź do modułów"
              onClick={onOpenHome}
            />
          }
        >
          <BookOpen className="text-primary" />
          <span className="truncate">NoteTracker</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">Przejdź do modułów</TooltipContent>
      </Tooltip>
    </div>
  );
}

type AppFrameProps = Props & {
  content: ReactNode;
  overlay?: ReactNode;
  sidebar: ReactNode;
};

export function AppFrame({
  children,
  content,
  onOpenHome,
  overlay,
  sidebar,
}: AppFrameProps) {
  const [headerActionsTarget, setHeaderActionsTarget] =
    useState<HTMLDivElement | null>(null);
  const [headerInfoTarget, setHeaderInfoTarget] =
    useState<HTMLDivElement | null>(null);
  const [headerTrailingActionsTarget, setHeaderTrailingActionsTarget] =
    useState<HTMLDivElement | null>(null);

  return (
    <TooltipProvider>
      <SidebarProvider
        className="flex-col"
        style={
          {
            "--sidebar-width": "clamp(17rem, 25vw, 20rem)",
          } as React.CSSProperties
        }
      >
        <HeaderInfoContext.Provider value={headerInfoTarget}>
          <HeaderActionsContext.Provider value={headerActionsTarget}>
            <HeaderTrailingActionsContext.Provider
              value={headerTrailingActionsTarget}
            >
              <AppHeader
                onActionsTargetChange={setHeaderActionsTarget}
                onInfoTargetChange={setHeaderInfoTarget}
                onTrailingActionsTargetChange={setHeaderTrailingActionsTarget}
                onOpenHome={onOpenHome}
              >
                {children}
              </AppHeader>
              <div className="flex min-h-0 flex-1">
                {sidebar}
                <SidebarInset className="h-[calc(100dvh-3.5rem)] max-h-[calc(100dvh-3.5rem)] min-w-0 overflow-hidden">
                  {content}
                </SidebarInset>
                {overlay}
              </div>
            </HeaderTrailingActionsContext.Provider>
          </HeaderActionsContext.Provider>
        </HeaderInfoContext.Provider>
      </SidebarProvider>
    </TooltipProvider>
  );
}
