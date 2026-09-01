import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Chapter } from "@/features/notes/model/types";
import type { Module, ModulesRepository } from "./data/modules-repository";

export function MoveChapterDialog({
  chapter,
  currentModuleId,
  repository,
  onClose,
  onMoved,
}: {
  chapter: Chapter;
  currentModuleId: string;
  repository: ModulesRepository;
  onClose: () => void;
  onMoved: () => Promise<void>;
}) {
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void repository
      .list()
      .then((items) =>
        setModules(items.filter((item) => item.id !== currentModuleId)),
      )
      .catch(() => setError("Nie udało się pobrać modułów."))
      .finally(() => setIsLoading(false));
  }, [currentModuleId, repository]);
  async function move() {
    if (!selectedId) return;
    setIsLoading(true);
    setError(null);
    try {
      await repository.moveChapter(chapter.id, selectedId);
      await onMoved();
      onClose();
    } catch {
      setError("Nie udało się przenieść rozdziału.");
      setIsLoading(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Przenieś „{chapter.title}”</DialogTitle>
          <DialogDescription>
            Wybierz moduł docelowy. Tematy, notatki, pytania i zdjęcia pozostaną
            przy rozdziale.
          </DialogDescription>
        </DialogHeader>
        {isLoading && !modules.length ? (
          <LoaderCircle className="mx-auto animate-spin" />
        ) : modules.length ? (
          <div className="space-y-2">
            {modules.map((module) => (
              <Button
                key={module.id}
                type="button"
                variant={selectedId === module.id ? "secondary" : "outline"}
                className="h-auto w-full justify-between py-3"
                onClick={() => setSelectedId(module.id)}
              >
                <span>{module.name}</span>
                <span className="text-xs text-muted-foreground">
                  {module.chaptersCount} rozdz.
                </span>
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Utwórz drugi moduł, aby przenieść rozdział.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Anuluj
          </Button>
          <Button
            disabled={!selectedId || isLoading}
            onClick={() => void move()}
          >
            {isLoading && selectedId ? "Przenoszenie…" : "Przenieś"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
