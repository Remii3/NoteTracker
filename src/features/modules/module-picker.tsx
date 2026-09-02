import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  LoaderCircle,
  LogOut,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
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
  onSignOut: () => void;
  onOpenTrash?: () => void;
};

export function ModulePicker({
  repository,
  onSelect,
  onSignOut,
  onOpenTrash,
}: Props) {
  const [modules, setModules] = useState<Module[]>([]);
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [renamedModule, setRenamedModule] = useState<Module | null>(null);
  const [deletedModule, setDeletedModule] = useState<Module | null>(null);

  async function loadModules() {
    setIsLoading(true);
    setError(null);
    try {
      setModules(await repository.list());
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
        if (active) setModules(items);
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
  }, [repository]);

  async function createModule() {
    const validationError = validateModuleName(name, modules);
    setNameError(validationError);
    if (validationError || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const created = await repository.create(
        normalizeModuleName(name),
        (modules.at(-1)?.position ?? 0) + 1000,
      );
      setModules((current) => [...current, created]);
      setName("");
      onSelect(created);
    } catch {
      setError("Nie udało się utworzyć modułu.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function reorder(id: string, direction: -1 | 1) {
    const previous = modules;
    const next = moveModule(previous, id, direction);
    if (next === previous) return;
    setModules(next);
    try {
      await repository.reorder(next.map((module) => module.id));
    } catch {
      setModules(previous);
      setError("Nie udało się zmienić kolejności modułów.");
    }
  }

  return (
    <main className="min-h-dvh bg-muted/20 px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">NoteTracker</p>
            <h1 className="mt-1 text-3xl font-semibold">Wybierz moduł</h1>
            <p className="mt-2 text-muted-foreground">
              Moduł grupuje rozdziały należące do jednego obszaru nauki.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onOpenTrash}>
              <Trash2 /> Usunięte
            </Button>
            <Button variant="ghost" onClick={onSignOut}>
              <LogOut /> Wyloguj
            </Button>
          </div>
        </header>
        <form
          className="mt-8"
          onSubmit={(event) => {
            event.preventDefault();
            void createModule();
          }}
        >
          <div className="flex gap-2">
            <Input
              value={name}
              maxLength={MODULE_NAME_MAX_LENGTH}
              aria-invalid={Boolean(nameError)}
              placeholder="Nazwa nowego modułu"
              onChange={(event) => {
                setName(event.target.value);
                setNameError(null);
              }}
            />
            <Button type="submit" disabled={!name.trim() || isSubmitting}>
              {isSubmitting ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Plus />
              )}
              Utwórz
            </Button>
          </div>
          <div className="mt-1 flex justify-between text-xs">
            <span className="text-destructive">{nameError}</span>
            <span className="text-muted-foreground">
              {name.length}/{MODULE_NAME_MAX_LENGTH}
            </span>
          </div>
        </form>
        {error && (
          <div className="mt-4 flex items-center gap-3 text-sm text-destructive">
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
          <div className="mt-12 flex justify-center">
            <LoaderCircle className="animate-spin text-muted-foreground" />
          </div>
        ) : modules.length ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((module, index) => (
              <article
                key={module.id}
                className="rounded-xl border bg-background p-5"
              >
                <button
                  type="button"
                  className="w-full text-left"
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
            setModules((current) =>
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
            setModules((current) =>
              current.filter((item) => item.id !== deletedModule.id),
            );
          }}
        />
      )}
    </main>
  );
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
