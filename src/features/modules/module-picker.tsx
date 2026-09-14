import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { readMemoryCache, writeMemoryCache } from "@/lib/memory-cache";
import { AppHeaderActions, AppHeaderInfo } from "@/layout/app-header";
import type { Module, ModulesRepository } from "./data/modules-repository";
import {
  MODULE_NAME_MAX_LENGTH,
  moveModule,
  normalizeModuleName,
  validateModuleName,
} from "./lib/module-validation";

type Props = {
  repository: ModulesRepository;
  onSelect: (module: Module) => void;
  cacheKey?: string;
  onDeleted?: (module: Module) => void;
  onLoaded?: (modules: Module[]) => void;
};

export function ModulePicker({
  repository,
  onSelect,
  cacheKey,
  onDeleted,
  onLoaded,
}: Props) {
  const cachedModules = cacheKey
    ? readMemoryCache<Module[]>(cacheKey)
    : undefined;
  const [modules, setModules] = useState<Module[]>(cachedModules ?? []);
  const [createOpen, setCreateOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(!cachedModules);
  const [error, setError] = useState<string | null>(null);
  const [renamedModule, setRenamedModule] = useState<Module | null>(null);
  const [deletedModule, setDeletedModule] = useState<Module | null>(null);
  const updateModules = useCallback(
    (update: Module[] | ((current: Module[]) => Module[])) => {
      setModules((current) => {
        const next = typeof update === "function" ? update(current) : update;
        if (cacheKey) writeMemoryCache(cacheKey, next);
        return next;
      });
    },
    [cacheKey],
  );

  async function loadModules() {
    setIsLoading(true);
    setError(null);
    try {
      const items = await repository.list();
      updateModules(items);
      onLoaded?.(items);
    } catch {
      setError("Nie udało się pobrać modułów.");
    } finally {
      setIsLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    void repository
      .list()
      .then((items) => {
        if (active) {
          updateModules(items);
          onLoaded?.(items);
        }
      })
      .catch(() => {
        if (active) setError("Nie udało się pobrać modułów.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onLoaded, repository, updateModules]);

  async function createModule(name: string) {
    setError(null);
    try {
      const created = await repository.create(
        name,
        (modules.at(-1)?.position ?? 0) + 1000,
      );
      updateModules((current) => [...current, created]);
      setCreateOpen(false);
      onSelect(created);
    } catch {
      throw new Error("create-module-failed");
    }
  }

  async function reorder(id: string, direction: -1 | 1) {
    const previous = modules;
    const next = moveModule(previous, id, direction);
    if (next === previous) return;
    updateModules(next);
    try {
      await repository.reorder(next.map((module) => module.id));
    } catch {
      updateModules(previous);
      setError("Nie udało się zmienić kolejności modułów.");
    }
  }

  return (
    <>
      <AppHeaderInfo>
        <p className="hidden truncate text-sm text-muted-foreground min-[480px]:block">
          {isLoading ? "Ładowanie modułów…" : formatModuleCount(modules.length)}
        </p>
      </AppHeaderInfo>
      <AppHeaderActions>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus />
          <span className="hidden sm:inline">Nowy moduł</span>
        </Button>
      </AppHeaderActions>
      <main className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
        <div>
          <header>
            <p className="text-sm font-medium text-primary">Twoja przestrzeń</p>
            <h1 className="mt-1 text-3xl font-semibold">Moduły</h1>
            <p className="mt-2 text-muted-foreground">
              Moduł grupuje rozdziały należące do jednego obszaru nauki.
            </p>
          </header>
          {error && (
            <div className="mt-8 flex items-center gap-3 text-sm text-destructive">
              <span>{error}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void loadModules()}
              >
                Spróbuj ponownie
              </Button>
            </div>
          )}
          {isLoading ? (
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
          ) : modules.length ? (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {modules.map((module, index) => (
                <article
                  key={module.id}
                  className="rounded-xl border bg-background p-5 transition-[border-color,box-shadow] has-[>button:first-child:focus-visible]:border-ring has-[>button:first-child:focus-visible]:ring-3 has-[>button:first-child:focus-visible]:ring-ring/50"
                >
                  <button
                    type="button"
                    className="w-full text-left outline-none"
                    onClick={() => onSelect(module)}
                  >
                    <BookOpen className="size-5 text-primary" />
                    <span className="mt-4 block font-semibold">
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
                      <span className="mt-4 block text-xs text-muted-foreground">
                        Brak tematów
                      </span>
                    )}
                  </button>
                  <div className="mt-4 flex gap-1 border-t pt-3">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Przenieś wyżej"
                      disabled={index === 0}
                      onClick={() => void reorder(module.id, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Przenieś niżej"
                      disabled={index === modules.length - 1}
                      onClick={() => void reorder(module.id, 1)}
                    >
                      <ArrowDown />
                    </Button>
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
                      aria-label="Usuń moduł"
                      onClick={() => setDeletedModule(module)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-8 rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
              Utwórz pierwszy moduł, aby rozpocząć.
            </div>
          )}
        </div>
        {renamedModule && (
          <RenameModuleDialog
            module={renamedModule}
            modules={modules}
            onClose={() => setRenamedModule(null)}
            onRename={async (nextName) => {
              await repository.rename(renamedModule.id, nextName);
              updateModules((current) =>
                current.map((item) =>
                  item.id === renamedModule.id
                    ? { ...item, name: nextName }
                    : item,
                ),
              );
            }}
          />
        )}
        {deletedModule && (
          <DeleteModuleDialog
            module={deletedModule}
            onClose={() => setDeletedModule(null)}
            onDelete={async () => {
              await repository.remove(deletedModule.id);
              updateModules((current) =>
                current.filter((item) => item.id !== deletedModule.id),
              );
              onDeleted?.(deletedModule);
            }}
          />
        )}
        {createOpen && (
          <CreateModuleDialog
            modules={modules}
            onClose={() => setCreateOpen(false)}
            onCreate={createModule}
          />
        )}
      </main>
    </>
  );
}

function formatModuleCount(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  const noun =
    count === 1
      ? "moduł"
      : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
        ? "moduły"
        : "modułów";
  return `${count} ${noun}`;
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
