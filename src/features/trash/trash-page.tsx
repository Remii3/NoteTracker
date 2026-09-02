import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/features/auth";
import { supabase } from "@/lib/supabase/client";
import { TrashRepository, type TrashItem } from "./trash-repository";

const labels: Record<TrashItem["item_type"], string> = {
  module: "Moduł",
  chapter: "Rozdział",
  topic: "Temat",
  image: "Zdjęcie",
  question: "Pytanie",
  study_session: "Sesja nauki",
};

export function TrashPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const repository = useMemo(
    () =>
      new TrashRepository(
        supabase,
        user?.id ?? "",
        import.meta.env.VITE_R2_IMAGES_API_URL as string | undefined,
      ),
    [user?.id],
  );
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [purgedItem, setPurgedItem] = useState<TrashItem | null>(null);
  useEffect(() => {
    let active = true;
    void repository
      .list()
      .then((value) => active && setItems(value))
      .catch(() => toast.error("Nie udało się pobrać usuniętych elementów."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [repository]);

  async function restore(item: TrashItem) {
    setPending(item.id);
    try {
      await repository.restore(item.id);
      setItems((all) => all.filter((x) => x.id !== item.id));
      toast.success("Element został przywrócony.");
    } catch {
      toast.error(
        "Nie udało się przywrócić elementu. Sprawdź, czy jego nazwa nie jest już używana.",
      );
    } finally {
      setPending(null);
    }
  }
  async function purge(item: TrashItem) {
    setPending(item.id);
    try {
      await repository.purge(item.id);
      setItems((all) => all.filter((x) => x.id !== item.id));
      setPurgedItem(null);
      toast.success("Element został trwale usunięty.");
    } catch {
      toast.error("Nie udało się trwale usunąć elementu.");
    } finally {
      setPending(null);
    }
  }

  return (
    <main className="min-h-dvh bg-muted/20 px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Button
          variant="ghost"
          className="-ml-3"
          onClick={() => navigate("/modules")}
        >
          <ArrowLeft /> Moduły
        </Button>
        <h1 className="mt-5 text-3xl font-semibold">Usunięte</h1>
        <p className="mt-2 text-muted-foreground">
          Elementy są automatycznie trwale usuwane po 24 godzinach.
        </p>
        {loading ? (
          <div className="mt-16 flex justify-center">
            <LoaderCircle className="animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed py-16 text-center text-muted-foreground">
            Nie masz żadnych usuniętych elementów.
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            {items.map((item) => (
              <article
                key={item.id}
                className="flex flex-col gap-4 rounded-xl border bg-background p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-primary">
                    {labels[item.item_type]}
                  </p>
                  <h2 className="mt-1 font-semibold">{item.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Trwałe usunięcie:{" "}
                    {new Intl.DateTimeFormat("pl-PL", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(item.purge_after))}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={pending === item.id}
                    onClick={() => void restore(item)}
                  >
                    <RotateCcw /> Przywróć
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={pending === item.id}
                    onClick={() => setPurgedItem(item)}
                  >
                    <Trash2 /> Usuń teraz
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      {purgedItem && (
        <AlertDialog
          open
          onOpenChange={(open) => !open && !pending && setPurgedItem(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Trwale usunąć „{purgedItem.title}”?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Element i cała należąca do niego zawartość zostaną usunięte bez
                możliwości przywrócenia.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={Boolean(pending)}>
                Anuluj
              </AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={Boolean(pending)}
                onClick={() => void purge(purgedItem)}
              >
                {pending ? "Usuwanie…" : "Usuń trwale"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </main>
  );
}
