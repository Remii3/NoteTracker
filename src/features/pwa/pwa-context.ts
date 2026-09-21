import { createContext, useContext } from "react";

export type PwaContextValue = {
  canInstall: boolean;
  isInstalled: boolean;
  isIos: boolean;
  isOnline: boolean;
  install: () => Promise<boolean>;
};

export const PwaContext = createContext<PwaContextValue | null>(null);

export function usePwa() {
  const value = useContext(PwaContext);
  if (!value) throw new Error("usePwa must be used inside PwaProvider");
  return value;
}
