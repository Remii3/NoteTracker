import {
  BookOpen,
  Download,
  FileUp,
  HardDriveDownload,
  LoaderCircle,
  Pencil,
  Pin,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { AppHeaderActions } from "@/layout/app-header-actions";
import { readMemoryCache, writeMemoryCache } from "@/lib/memory-cache";
import type { Module, ModulesRepository } from "./data/modules-repository";
import {
  MODULE_NAME_MAX_LENGTH,
  compareModules,
  normalizeModuleName,
  validateModuleName,
} from "./lib/module-validation";
import type { ImportedModuleDraft } from "./import/docx-import";
import { ModuleImportDialog } from "./import/module-import-dialog";
import type { TopicImagesService } from "@/features/notes/data/topic-images-service";
import type { TopicImage } from "@/features/notes/types/topic-image";
import type { OfflineModuleService } from "@/features/notes/offline/offline-module-service";
import type { OfflineModuleSnapshot } from "@/features/notes/offline/offline-types";

type Props = {
  repository: ModulesRepository;
  imagesService?: TopicImagesService;
  onSelect: (module: Module) => void;
  cacheKey?: string;
  onDeleted?: (module: Module) => void;
  onLoaded?: (modules: Module[]) => void;
  offlineService?: OfflineModuleService;
};

const PAGE_SIZE = 12;

export function ModulePicker({
  repository,
  imagesService,
  onSelect,
  cacheKey,
  onDeleted,
  onLoaded,
  offlineService,
}: Props) {
  const cachedModules = cacheKey
    ? readMemoryCache<Module[]>(cacheKey)
    : undefined;
  const [pinnedModules, setPinnedModules] = useState<Module[]>(
    cachedModules?.filter((module) => module.isPinned) ?? [],
  );
  const [modules, setModules] = useState<Module[]>(
    cachedModules?.filter((module) => !module.isPinned) ?? [],
  );
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(!cachedModules);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pinningModuleId, setPinningModuleId] = useState<string | null>(null);
  const [exportingModuleId, setExportingModuleId] = useState<string | null>(
    null,
  );
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [renamedModule, setRenamedModule] = useState<Module | null>(null);
  const [deletedModule, setDeletedModule] = useState<Module | null>(null);
  const [offlineModule, setOfflineModule] = useState<Module | null>(null);
  const [offlineSnapshots, setOfflineSnapshots] = useState<
    OfflineModuleSnapshot[]
  >([]);
  const [importOpen, setImportOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const loadingMoreRef = useRef(false);

  const refreshOfflineSnapshots = useCallback(async () => {
    if (!offlineService) return [];
    try {
      const snapshots = await offlineService.list();
      setOfflineSnapshots(snapshots);
      return snapshots;
    } catch {
      setOfflineSnapshots([]);
      return [];
    }
  }, [offlineService]);

  useEffect(() => {
    queueMicrotask(() => void refreshOfflineSnapshots());
  }, [refreshOfflineSnapshots]);
  const sortedModules = useMemo(
    () => [...pinnedModules, ...modules].sort(compareModules),
    [modules, pinnedModules],
  );
  const updateModules = useCallback(
    (update: Module[] | ((current: Module[]) => Module[])) => {
      setModules((current) => {
        return typeof update === "function" ? update(current) : update;
      });
    },
    [],
  );

  async function getNextPosition() {
    const loadedModules = [...pinnedModules, ...modules];
    const allModules =
      query || hasMore ? await repository.list() : loadedModules;
    return Math.max(0, ...allModules.map((module) => module.position)) + 1000;
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    let active = true;
    const requestId = ++requestIdRef.current;
    queueMicrotask(() => {
      if (!active) return;
      setIsLoading(true);
      setIsLoadingMore(false);
      loadingMoreRef.current = false;
      setError(null);
      void Promise.all([
        repository.listPinned(),
        repository.listPage(query, 0, PAGE_SIZE),
      ])
        .then(([pinned, page]) => {
          if (!active || requestId !== requestIdRef.current) return;
          setPinnedModules(pinned);
          setModules(page.modules);
          setHasMore(page.hasMore);
          const loadedModules = [...pinned, ...page.modules];
          if (!query && cacheKey) writeMemoryCache(cacheKey, loadedModules);
          if (!query && !page.hasMore) onLoaded?.(loadedModules);
        })
        .catch(async () => {
          if (!active || requestId !== requestIdRef.current) return;
          const offline = await refreshOfflineSnapshots();
          if (!active || requestId !== requestIdRef.current) return;
          if (offline.length) {
            const normalizedQuery = query.toLocaleLowerCase("pl");
            const visibleOffline = normalizedQuery
              ? offline.filter((item) =>
                  item.module.name
                    .toLocaleLowerCase("pl")
                    .includes(normalizedQuery),
                )
              : offline;
            setPinnedModules(
              visibleOffline
                .filter((item) => item.module.isPinned)
                .map((item) => item.module),
            );
            setModules(
              visibleOffline
                .filter((item) => !item.module.isPinned)
                .map((item) => item.module),
            );
            setHasMore(false);
            setError(null);
          } else setError("Nie udało się pobrać modułów.");
        })
        .finally(() => {
          if (active && requestId === requestIdRef.current) setIsLoading(false);
        });
    });
    return () => {
      active = false;
    };
  }, [
    cacheKey,
    onLoaded,
    query,
    refreshOfflineSnapshots,
    reloadKey,
    repository,
  ]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore || isLoading) return;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    const requestId = requestIdRef.current;
    try {
      const page = await repository.listPage(query, modules.length, PAGE_SIZE);
      if (requestId !== requestIdRef.current) return;
      const knownIds = new Set(modules.map((module) => module.id));
      const next = [
        ...modules,
        ...page.modules.filter((module) => !knownIds.has(module.id)),
      ];
      setModules(next);
      setHasMore(page.hasMore);
      const loadedModules = [...pinnedModules, ...next];
      if (!query && cacheKey) writeMemoryCache(cacheKey, loadedModules);
      if (!query && !page.hasMore) onLoaded?.(loadedModules);
    } catch {
      if (requestId === requestIdRef.current)
        setError("Nie udało się pobrać kolejnych modułów.");
    } finally {
      if (requestId === requestIdRef.current) setIsLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, [
    cacheKey,
    hasMore,
    isLoading,
    modules,
    onLoaded,
    pinnedModules,
    query,
    repository,
  ]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasMore || isLoading) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore();
      },
      { root: mainRef.current, rootMargin: "300px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, loadMore]);

  async function createModule(name: string) {
    setError(null);
    try {
      const created = await repository.create(name, await getNextPosition());
      updateModules((current) => [...current, created]);
      if (!query && cacheKey)
        writeMemoryCache(cacheKey, [...pinnedModules, ...modules, created]);
      setCreateOpen(false);
    } catch {
      throw new Error("create-module-failed");
    }
  }

  async function importDocx(draft: ImportedModuleDraft) {
    const imported = await repository.importDocx(
      draft,
      await getNextPosition(),
    );
    updateModules((current) => [...current, imported]);
    if (!query && cacheKey)
      writeMemoryCache(cacheKey, [...pinnedModules, ...modules, imported]);
    setImportOpen(false);
    toast.add({
      data: { type: "success" },
      description: `Zaimportowano moduł „${imported.name}”.`,
    });
  }

  async function togglePinned(module: Module) {
    if (pinningModuleId) return;
    const nextPinned = !module.isPinned;
    const previousPinned = pinnedModules;
    const previousModules = modules;
    const requestId = requestIdRef.current;
    setPinningModuleId(module.id);
    setError(null);
    if (nextPinned) {
      setModules((current) => current.filter((item) => item.id !== module.id));
      setPinnedModules((current) => [
        ...current,
        { ...module, isPinned: true },
      ]);
    } else {
      setPinnedModules((current) =>
        current.filter((item) => item.id !== module.id),
      );
      if (!query)
        setModules((current) => [...current, { ...module, isPinned: false }]);
    }

    try {
      await repository.setPinned(module.id, nextPinned);
    } catch {
      if (requestId === requestIdRef.current) {
        setPinnedModules(previousPinned);
        setModules(previousModules);
        if (!query && cacheKey)
          writeMemoryCache(cacheKey, [...previousPinned, ...previousModules]);
        setError("Nie udało się zmienić przypięcia modułu.");
      }
      setPinningModuleId(null);
      return;
    }

    try {
      const [pinned, page] = await Promise.all([
        repository.listPinned(),
        repository.listPage(query, 0, Math.max(PAGE_SIZE, modules.length)),
      ]);
      if (requestId === requestIdRef.current) {
        setPinnedModules(pinned);
        setModules(page.modules);
        setHasMore(page.hasMore);
        const loadedModules = [...pinned, ...page.modules];
        if (!query && cacheKey) writeMemoryCache(cacheKey, loadedModules);
        if (!query && !page.hasMore) onLoaded?.(loadedModules);
      }
    } catch {
      if (requestId === requestIdRef.current)
        setError("Zmieniono przypięcie, ale nie udało się odświeżyć listy.");
    } finally {
      setPinningModuleId(null);
    }
  }

  async function exportModule(module: Module) {
    if (exportingModuleId) return;
    setExportingModuleId(module.id);
    setError(null);
    try {
      const data = await repository.getExportData(module.id);
      const imagesByTopic = new Map<string, TopicImage[]>();
      let omittedImages = false;
      if (imagesService) {
        const topics = data.chapters.flatMap((chapter) => chapter.topics);
        const results = await Promise.allSettled(
          topics.map((topic) => imagesService.list(topic.id)),
        );
        results.forEach((result, index) => {
          if (result.status === "fulfilled")
            imagesByTopic.set(topics[index].id, result.value);
          else omittedImages = true;
        });
      }
      const { downloadModuleDocx } = await import("./export/docx-export");
      await downloadModuleDocx(data, imagesByTopic);
      toast.add({
        data: { type: omittedImages ? "warning" : "success" },
        description: omittedImages
          ? `Wyeksportowano „${module.name}”, ale części materiałów nie udało się dołączyć.`
          : `Wyeksportowano moduł „${module.name}”.`,
      });
    } catch {
      toast.add({
        data: { type: "error" },
        description: `Nie udało się wyeksportować modułu „${module.name}”.`,
      });
    } finally {
      setExportingModuleId(null);
    }
  }

  const searchInput = (className?: string, autoFocus = false) => (
    <div className={`relative ${className ?? ""}`}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Szukaj modułów"
        aria-label="Szukaj modułów"
        className="h-8 px-9"
        autoFocus={autoFocus}
      />
      {search && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Wyczyść wyszukiwanie"
          className="absolute top-1/2 right-1 -translate-y-1/2 active:not-aria-[haspopup]:-translate-y-1/2!"
          onClick={() => setSearch("")}
        >
          <X />
        </Button>
      )}
    </div>
  );

  return (
    <>
      <AppHeaderActions>
        {searchInput("hidden w-56 sm:block lg:w-64")}
        <Popover>
          <PopoverTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant={search ? "secondary" : "outline"}
                className="sm:hidden"
                aria-label="Szukaj modułów"
              />
            }
          >
            <Search />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-3 sm:hidden">
            {searchInput(undefined, true)}
          </PopoverContent>
        </Popover>
        <Button
          size="sm"
          variant="outline"
          aria-label="Importuj materiały"
          onClick={() => setImportOpen(true)}
        >
          <FileUp />
          <span className="hidden lg:inline">Importuj</span>
        </Button>
        <Button
          size="sm"
          aria-label="Nowy moduł"
          onClick={() => setCreateOpen(true)}
        >
          <Plus />
          <span className="hidden lg:inline">Nowy moduł</span>
        </Button>
      </AppHeaderActions>
      <main
        ref={mainRef}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-12"
      >
        <div>
          <header>
            <div>
              <p className="text-sm font-medium text-primary">
                Twoja przestrzeń
              </p>
              <h1 className="mt-1 text-3xl font-semibold">Moduły</h1>
              <p className="mt-2 text-muted-foreground">
                Moduł grupuje rozdziały należące do jednego obszaru nauki.
              </p>
            </div>
          </header>
          {error && (
            <div className="mt-8 flex items-center gap-3 text-sm text-destructive">
              <span>{error}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setReloadKey((current) => current + 1)}
              >
                Spróbuj ponownie
              </Button>
            </div>
          )}
          {isLoading && !sortedModules.length ? (
            <div
              className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              role="status"
              aria-busy="true"
              aria-label="Ładowanie modułów"
            >
              {Array.from({ length: 6 }, (_, index) => (
                <div
                  key={index}
                  className="rounded-xl border bg-background p-5"
                  aria-hidden="true"
                >
                  <Skeleton className="size-5 rounded-md" />
                  <Skeleton className="mt-4 h-5 w-3/4" />
                  <Skeleton className="mt-2 h-4 w-24" />
                  <div className="mt-4 flex gap-2 border-t pt-3">
                    {Array.from({ length: 4 }, (_, actionIndex) => (
                      <Skeleton
                        key={actionIndex}
                        className="size-8 rounded-md"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : sortedModules.length ? (
            <>
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sortedModules.map((module) => (
                  <article
                    key={module.id}
                    className="rounded-xl border bg-background p-5 transition-[border-color,box-shadow] has-[>button:first-child:focus-visible]:border-ring has-[>button:first-child:focus-visible]:ring-3 has-[>button:first-child:focus-visible]:ring-ring/50 data-[pinned=true]:border-primary/40"
                    data-pinned={module.isPinned}
                  >
                    <button
                      type="button"
                      className="w-full text-left outline-none"
                      onClick={() => onSelect(module)}
                    >
                      <BookOpen className="size-5 text-primary" />
                      <span
                        className="mt-4 block truncate font-semibold"
                        title={module.name}
                      >
                        {module.name}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {module.chaptersCount === 1
                          ? "1 rozdział"
                          : `${module.chaptersCount} rozdziałów`}
                      </span>
                      {module.topicsCount ? (
                        <span className="mt-4 block">
                          <span className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                            <span>
                              {module.completedTopicsCount}/{module.topicsCount}{" "}
                              tematów
                            </span>
                            <span className="font-medium text-foreground">
                              {getModuleProgress(module)}%
                            </span>
                          </span>
                          <Progress
                            className="mt-2"
                            value={getModuleProgress(module)}
                            aria-label={`Postęp modułu ${module.name}`}
                          />
                        </span>
                      ) : (
                        <div>
                          <span className="mt-4 block text-xs text-muted-foreground">
                            Brak tematów
                          </span>
                          <Progress
                            className="mt-2"
                            value={getModuleProgress(module)}
                            aria-label={`Postęp modułu ${module.name}`}
                          />
                        </div>
                      )}
                    </button>
                    <div className="mt-4 flex gap-1 border-t pt-3">
                      <Button
                        size="icon-sm"
                        variant={module.isPinned ? "secondary" : "ghost"}
                        aria-label={
                          module.isPinned ? "Odepnij moduł" : "Przypnij moduł"
                        }
                        aria-pressed={module.isPinned}
                        disabled={Boolean(pinningModuleId)}
                        onClick={() => void togglePinned(module)}
                      >
                        {pinningModuleId === module.id ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <Pin
                            className={module.isPinned ? "fill-current" : ""}
                          />
                        )}
                      </Button>
                      {offlineService && (
                        <Button
                          size="icon-sm"
                          variant={
                            offlineSnapshots.some(
                              (snapshot) => snapshot.module.id === module.id,
                            )
                              ? "secondary"
                              : "ghost"
                          }
                          aria-label={
                            offlineSnapshots.some(
                              (snapshot) => snapshot.module.id === module.id,
                            )
                              ? `Zarządzaj dostępem offline modułu ${module.name}`
                              : `Pobierz moduł ${module.name} do użycia offline`
                          }
                          onClick={() => setOfflineModule(module)}
                        >
                          <HardDriveDownload />
                        </Button>
                      )}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Zmień nazwę"
                        onClick={() => setRenamedModule(module)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Eksportuj moduł ${module.name} do Worda`}
                        disabled={Boolean(exportingModuleId)}
                        onClick={() => void exportModule(module)}
                      >
                        {exportingModuleId === module.id ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <Download />
                        )}
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Usuń moduł"
                        onClick={() => setDeletedModule(module)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
              {hasMore && (
                <div
                  ref={loadMoreRef}
                  className="flex min-h-24 items-center justify-center"
                  role="status"
                  aria-label="Ładowanie kolejnych modułów"
                >
                  {isLoadingMore && (
                    <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="mt-8 rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
              {query
                ? `Brak przypiętych modułów ani wyników dla „${query}”.`
                : "Utwórz pierwszy moduł, aby rozpocząć."}
            </div>
          )}
        </div>
        {renamedModule && (
          <RenameModuleDialog
            module={renamedModule}
            modules={sortedModules}
            onClose={() => setRenamedModule(null)}
            onRename={async (nextName) => {
              await repository.rename(renamedModule.id, nextName);
              const rename = (item: Module) =>
                item.id === renamedModule.id
                  ? { ...item, name: nextName }
                  : item;
              setPinnedModules((current) => current.map(rename));
              updateModules((current) => current.map(rename));
              if (!query && cacheKey)
                writeMemoryCache(cacheKey, sortedModules.map(rename));
            }}
          />
        )}
        {deletedModule && (
          <DeleteModuleDialog
            module={deletedModule}
            onClose={() => setDeletedModule(null)}
            onDelete={async () => {
              await repository.remove(deletedModule.id);
              setPinnedModules((current) =>
                current.filter((item) => item.id !== deletedModule.id),
              );
              updateModules((current) =>
                current.filter((item) => item.id !== deletedModule.id),
              );
              if (!query && cacheKey)
                writeMemoryCache(
                  cacheKey,
                  sortedModules.filter((item) => item.id !== deletedModule.id),
                );
              await offlineService
                ?.remove(deletedModule.id)
                .catch(() => undefined);
              onDeleted?.(deletedModule);
            }}
          />
        )}
        {offlineModule && offlineService && (
          <OfflineModuleDialog
            module={offlineModule}
            snapshot={offlineSnapshots.find(
              (item) => item.module.id === offlineModule.id,
            )}
            service={offlineService}
            onClose={() => setOfflineModule(null)}
            onChanged={refreshOfflineSnapshots}
          />
        )}
        {createOpen && (
          <CreateModuleDialog
            modules={sortedModules}
            onClose={() => setCreateOpen(false)}
            onCreate={createModule}
          />
        )}
        {importOpen && (
          <ModuleImportDialog
            existingModuleNames={sortedModules.map((module) => module.name)}
            onClose={() => setImportOpen(false)}
            onImport={importDocx}
          />
        )}
      </main>
    </>
  );
}

function OfflineModuleDialog({
  module,
  snapshot,
  service,
  onClose,
  onChanged,
}: {
  module: Module;
  snapshot?: OfflineModuleSnapshot;
  service: OfflineModuleService;
  onClose: () => void;
  onChanged: () => Promise<OfflineModuleSnapshot[]>;
}) {
  const [includeImages, setIncludeImages] = useState(
    snapshot?.includesImages ?? false,
  );
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (isWorking) return;
    setIsWorking(true);
    setError(null);
    try {
      await service.sync(module, includeImages);
      await onChanged();
      toast.add({
        data: { type: "success" },
        description: `Moduł „${module.name}” jest dostępny offline.`,
      });
      onClose();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Nie udało się pobrać modułu.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function remove() {
    if (isWorking) return;
    setIsWorking(true);
    setError(null);
    try {
      await service.remove(module.id);
      await onChanged();
      onClose();
    } catch {
      setError("Nie udało się usunąć lokalnej kopii modułu.");
      setIsWorking(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !isWorking && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dostęp offline</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {snapshot
              ? `Moduł „${module.name}” jest zapisany na tym urządzeniu.`
              : `Pobierz treść modułu „${module.name}”, aby korzystać z niej bez internetu.`}
          </p>
          <label className="flex items-start gap-3 rounded-lg border p-3">
            <Checkbox
              checked={includeImages}
              disabled={isWorking}
              onCheckedChange={setIncludeImages}
            />
            <span>
              <span className="block text-sm font-medium">Dołącz zdjęcia</span>
              <span className="block text-xs text-muted-foreground">
                Zdjęcia mogą zajmować znacznie więcej miejsca i transferu niż
                tekst.
              </span>
            </span>
          </label>
          {snapshot && (
            <p className="text-xs text-muted-foreground">
              Ostatnia synchronizacja:{" "}
              {new Date(snapshot.syncedAt).toLocaleString("pl-PL")}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          {snapshot && (
            <Button
              type="button"
              variant="destructive"
              disabled={isWorking}
              onClick={() => void remove()}
            >
              Usuń z urządzenia
            </Button>
          )}
          <Button
            type="button"
            disabled={isWorking}
            onClick={() => void save()}
          >
            {isWorking && <LoaderCircle className="animate-spin" />}
            {snapshot ? "Synchronizuj" : "Pobierz"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateModuleDialog({
  modules,
  onClose,
  onCreate,
}: {
  modules: Module[];
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const validationError = validateModuleName(name, modules);
    setError(validationError);
    if (validationError) return;
    setIsSubmitting(true);
    try {
      await onCreate(normalizeModuleName(name));
    } catch {
      setError("Nie udało się utworzyć modułu.");
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nowy moduł</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <Input
            autoFocus
            value={name}
            maxLength={MODULE_NAME_MAX_LENGTH}
            aria-invalid={Boolean(error)}
            placeholder="Nazwa nowego modułu"
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
          <div className="flex justify-between text-xs">
            <span className="text-destructive">{error}</span>
            <span className="text-muted-foreground">
              {name.length}/{MODULE_NAME_MAX_LENGTH}
            </span>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={onClose}
            >
              Anuluj
            </Button>
            <Button type="submit" disabled={!name.trim() || isSubmitting}>
              {isSubmitting && <LoaderCircle className="animate-spin" />}
              Utwórz
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function getModuleProgress(module: Module) {
  return module.topicsCount
    ? Math.round((module.completedTopicsCount * 100) / module.topicsCount)
    : 0;
}

function DeleteModuleDialog({
  module,
  onClose,
  onDelete,
}: {
  module: Module;
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = confirmation === module.name;
  async function remove() {
    if (!confirmed || isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      await onDelete();
      onClose();
    } catch {
      setError(
        "Nie udało się usunąć modułu. Dane nie zostały usunięte z bazy.",
      );
      setIsDeleting(false);
    }
  }
  return (
    <AlertDialog
      open
      onOpenChange={(open) => !open && !isDeleting && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Przenieść moduł „{module.name}” do usuniętych?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Moduł wraz z rozdziałami, tematami, zdjęciami, pytaniami i sesjami
            nauki będzie można przywrócić przez 24 godziny.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <label
            htmlFor="module-delete-confirmation"
            className="text-sm font-medium"
          >
            Aby potwierdzić, wpisz: <strong>{module.name}</strong>
          </label>
          <Input
            id="module-delete-confirmation"
            autoComplete="off"
            value={confirmation}
            disabled={isDeleting}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Anuluj</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!confirmed || isDeleting}
            onClick={() => void remove()}
          >
            {isDeleting ? "Przenoszenie…" : "Przenieś do usuniętych"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RenameModuleDialog({
  module,
  modules,
  onClose,
  onRename,
}: {
  module: Module;
  modules: Module[];
  onClose: () => void;
  onRename: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(module.name);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const validationError = validateModuleName(name, modules, module.id);
    setError(validationError);
    if (validationError) return;
    setIsSaving(true);
    try {
      await onRename(normalizeModuleName(name));
      onClose();
    } catch {
      setError("Nie udało się zmienić nazwy modułu.");
    } finally {
      setIsSaving(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Zmień nazwę modułu</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Input
            autoFocus
            maxLength={MODULE_NAME_MAX_LENGTH}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
          <div className="flex justify-between text-xs">
            <span className="text-destructive">{error}</span>
            <span className="text-muted-foreground">
              {name.length}/{MODULE_NAME_MAX_LENGTH}
            </span>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Anuluj
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Zapisywanie…" : "Zapisz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
