import { useState, type FormEvent } from "react";

import {
  AlertDialog,
  AlertDialogAction,
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { titlesAreEqual } from "../lib/title-utils";
import type { ManagedItem } from "../model/workspace-types";

type RenameProps = {
  item: ManagedItem;
  onClose: () => void;
  onRename: (title: string) => Promise<boolean>;
};

export function RenameItemDialog({ item, onClose, onRename }: RenameProps) {
  const [title, setTitle] = useState(item.title);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) return;
    if (
      item.unavailableTitles?.some((unavailableTitle) =>
        titlesAreEqual(unavailableTitle, nextTitle),
      )
    ) {
      setError(
        item.kind === "chapter"
          ? "Rozdział o tej nazwie już istnieje."
          : "Temat o tej nazwie już istnieje w tym rozdziale.",
      );
      return;
    }
    setIsSubmitting(true);
    const renamed = await onRename(nextTitle);
    setIsSubmitting(false);
    if (!renamed) return;
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Zmień nazwę {item.kind === "chapter" ? "rozdziału" : "tematu"}
          </DialogTitle>
          <DialogDescription>
            Zmiana nazwy nie wpłynie na notatki ani kolejność elementów.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <Input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Nowa nazwa"
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={onClose}
            >
              Anuluj
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Zapisywanie…" : "Zapisz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type DeleteProps = {
  item: ManagedItem;
  onClose: () => void;
  onDelete: () => Promise<boolean>;
};

export function DeleteItemDialog({ item, onClose, onDelete }: DeleteProps) {
  const isChapter = item.kind === "chapter";
  const [isSubmitting, setIsSubmitting] = useState(false);
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Usunąć {isChapter ? "rozdział" : "temat"} „{item.title}”?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isChapter && item.childCount
              ? `Razem z rozdziałem usuniesz ${item.childCount} ${item.childCount === 1 ? "temat" : "tematy"} i wszystkie ich notatki.`
              : "Tej operacji nie będzie można cofnąć."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting} onClick={onClose}>
            Anuluj
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isSubmitting}
            onClick={async () => {
              setIsSubmitting(true);
              const deleted = await onDelete();
              setIsSubmitting(false);
              if (deleted) onClose();
            }}
          >
            {isSubmitting ? "Usuwanie…" : "Usuń"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type UnsavedProps = {
  onCancel: () => void;
  onDiscard: () => void;
  description?: string;
  discardLabel?: string;
};

export function UnsavedChangesDialog({
  onCancel,
  onDiscard,
  description = "Zmiany w treści tej notatki zostaną utracone po przejściu do innego tematu.",
  discardLabel = "Odrzuć i przejdź dalej",
}: UnsavedProps) {
  return (
    <AlertDialog open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent className="sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Masz niezapisane zmiany</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Zostań</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDiscard}>
            {discardLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
