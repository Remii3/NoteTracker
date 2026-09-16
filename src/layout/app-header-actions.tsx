import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

const AppHeaderActionsContext = createContext<HTMLElement | null>(null);

export function AppHeaderActionsProvider({
  target,
  children,
}: {
  target: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <AppHeaderActionsContext.Provider value={target}>
      {children}
    </AppHeaderActionsContext.Provider>
  );
}

export function AppHeaderActions({ children }: { children: ReactNode }) {
  const target = useContext(AppHeaderActionsContext);
  return target ? createPortal(children, target) : null;
}
