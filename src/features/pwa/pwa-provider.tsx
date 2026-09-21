import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CloudOff, Download, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { PwaContext, usePwa, type PwaContextValue } from "./pwa-context";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function useServiceWorker() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const reloadAfterActivation = useRef(false);

  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      (import.meta.env.DEV && import.meta.env.MODE !== "test")
    )
      return;

    let active = true;
    const handleControllerChange = () => {
      if (reloadAfterActivation.current) window.location.reload();
    };
    const watchInstallingWorker = (worker: ServiceWorker) => {
      worker.addEventListener("statechange", () => {
        if (!active || worker.state !== "installed") return;
        if (navigator.serviceWorker.controller) setNeedRefresh(true);
        else setOfflineReady(true);
      });
    };
    const register = async () => {
      try {
        const nextRegistration = await navigator.serviceWorker.register(
          "/sw.js",
          { scope: "/" },
        );
        if (!active) return;
        registration.current = nextRegistration;
        if (nextRegistration.waiting && navigator.serviceWorker.controller)
          setNeedRefresh(true);
        if (nextRegistration.installing)
          watchInstallingWorker(nextRegistration.installing);
        nextRegistration.addEventListener("updatefound", () => {
          if (nextRegistration.installing)
            watchInstallingWorker(nextRegistration.installing);
        });
      } catch (error) {
        console.error("Nie udało się uruchomić trybu PWA.", error);
      }
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange,
    );
    if (document.readyState === "complete") void register();
    else window.addEventListener("load", register, { once: true });

    return () => {
      active = false;
      window.removeEventListener("load", register);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
    };
  }, []);

  const updateServiceWorker = useCallback(() => {
    const waiting = registration.current?.waiting;
    if (!waiting) return;
    reloadAfterActivation.current = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
  }, []);

  return {
    needRefresh,
    offlineReady,
    setNeedRefresh,
    setOfflineReady,
    updateServiceWorker,
  };
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

function isIosDevice() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isInstalled, setIsInstalled] = useState(isStandalone);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  );
  const {
    needRefresh,
    offlineReady,
    setNeedRefresh,
    setOfflineReady,
    updateServiceWorker,
  } = useServiceWorker();

  useEffect(() => {
    let wasOffline = !navigator.onLine;
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        toast.add({
          data: { type: "success" },
          description: "Połączenie zostało przywrócone.",
        });
      }
      wasOffline = false;
    };
    const handleOffline = () => {
      wasOffline = true;
      setIsOnline(false);
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (!offlineReady) return;
    toast.add({
      data: { type: "success" },
      description: "NoteTracker jest gotowy do szybkiego uruchamiania.",
    });
    setOfflineReady(false);
  }, [offlineReady, setOfflineReady]);

  const install = useCallback(async () => {
    if (!installPrompt) return false;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") setIsInstalled(true);
    return choice.outcome === "accepted";
  }, [installPrompt]);

  const value = useMemo<PwaContextValue>(
    () => ({
      canInstall: Boolean(installPrompt),
      install,
      isInstalled,
      isIos: isIosDevice(),
      isOnline,
    }),
    [install, installPrompt, isInstalled, isOnline],
  );

  return (
    <PwaContext.Provider value={value}>
      {children}
      {!isOnline && <OfflineBanner />}
      {needRefresh && (
        <UpdateBanner
          onDismiss={() => setNeedRefresh(false)}
          onUpdate={updateServiceWorker}
        />
      )}
    </PwaContext.Provider>
  );
}

function OfflineBanner() {
  return (
    <div
      role="status"
      className="fixed inset-x-3 top-3 z-[100] mx-auto flex w-fit max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-full border bg-popover px-4 py-2 text-sm text-popover-foreground shadow-lg"
    >
      <CloudOff className="size-4 text-destructive" aria-hidden="true" />
      Brak połączenia. Zmiany wymagające serwera nie zostaną zapisane.
    </div>
  );
}

function UpdateBanner({
  onDismiss,
  onUpdate,
}: {
  onDismiss: () => void;
  onUpdate: () => void;
}) {
  return (
    <div
      role="status"
      className="fixed right-3 bottom-3 z-[90] w-[calc(100%-1.5rem)] max-w-sm rounded-2xl border bg-popover p-4 text-popover-foreground shadow-xl"
    >
      <div className="flex gap-3">
        <RefreshCw className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <p className="font-medium">Dostępna jest nowa wersja</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Zapisz rozpoczętą pracę przed odświeżeniem aplikacji.
          </p>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          Później
        </Button>
        <Button type="button" size="sm" onClick={onUpdate}>
          <RefreshCw /> Odśwież
        </Button>
      </div>
    </div>
  );
}

export function InstallAppButton() {
  const pwa = usePwa();
  if (pwa.isInstalled) return null;
  if (!pwa.canInstall && !pwa.isIos) return null;

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Download />
        </span>
        <div>
          <h2 className="font-semibold">Aplikacja na urządzeniu</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {pwa.canInstall
              ? "Zainstaluj NoteTracker, aby otwierać go jak zwykłą aplikację."
              : "W Safari wybierz Udostępnij, a następnie Dodaj do ekranu początkowego."}
          </p>
        </div>
      </div>
      {pwa.canInstall && (
        <Button
          type="button"
          variant="outline"
          className="mt-5"
          onClick={() => void pwa.install()}
        >
          <Download /> Zainstaluj aplikację
        </Button>
      )}
    </section>
  );
}
