import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { NoteSyncConflict } from "../hooks/use-note-sync";
import type { NoteContent } from "../types/model";

type Props = {
  conflict: NoteSyncConflict;
  conflictCount: number;
  isWorking: boolean;
  error: string | null;
  onClose: () => void;
  onKeepLocal: (conflict: NoteSyncConflict) => Promise<boolean>;
  onUseServer: (conflict: NoteSyncConflict) => void;
};

export function NoteSyncConflictDialog({
  conflict,
  conflictCount,
  isWorking,
  error,
  onClose,
  onKeepLocal,
  onUseServer,
}: Props) {
  const [confirmServer, setConfirmServer] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && !isWorking && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Konflikt notatki „{conflict.topicTitle}”</DialogTitle>
          <DialogDescription>
            Notatka została zmieniona również na serwerze. Porównaj obie wersje
            i zdecyduj, którą zachować.
            {conflictCount > 1 && ` Pozostałe konflikty: ${conflictCount - 1}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <ContentPreview
            title="Wersja lokalna"
            content={conflict.localContent}
          />
          <ContentPreview
            title="Wersja na serwerze"
            content={conflict.serverContent}
          />
        </div>
        {confirmServer && (
          <p role="alert" className="text-sm text-destructive">
            Lokalny szkic zostanie usunięty. Kliknij ponownie, aby potwierdzić.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant={confirmServer ? "destructive" : "outline"}
            disabled={isWorking}
            onClick={() => {
              if (!confirmServer) {
                setConfirmServer(true);
                return;
              }
              onUseServer(conflict);
              setConfirmServer(false);
            }}
          >
            Użyj wersji serwerowej
          </Button>
          <Button
            type="button"
            disabled={isWorking}
            onClick={() => void onKeepLocal(conflict)}
          >
            Zachowaj wersję lokalną
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContentPreview({
  title,
  content,
}: {
  title: string;
  content: NoteContent;
}) {
  const text = richTextToPlainText(content);
  return (
    <section className="min-w-0 rounded-lg border p-3">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
        {text || "(pusta notatka)"}
      </div>
    </section>
  );
}

function richTextToPlainText(node: NoteContent): string {
  const ownText = typeof node.text === "string" ? node.text : "";
  const childText = (node.content ?? [])
    .map(richTextToPlainText)
    .filter(Boolean)
    .join(node.type === "doc" ? "\n" : "");
  return `${ownText}${childText}`.trim();
}
