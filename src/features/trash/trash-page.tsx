import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "@/components/ui/toast";

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
import { supabase } from "@/lib/supabase/client";
import {
  TrashRepository,
  type TrashCursor,
  type TrashItem,
  type TrashItemType,
  type TrashTreeNode,
} from "./trash-repository";

const PAGE_SIZE = 10;
const repository = new TrashRepository(
  supabase,
  import.meta.env.VITE_R2_IMAGES_API_URL as string | undefined,
);

const labels: Record<TrashItemType, string> = {
  module: "Moduł",
  chapter: "Rozdział",
  topic: "Temat",
  image: "Zdjęcie",
  question: "Pytanie",
  study_session: "Sesja nauki",
};

const deletionDateFormatter = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function TrashPage() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<TrashCursor | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCursors, setPageCursors] = useState<Array<TrashCursor | null>>([
    null,
  ]);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [purgedItem, setPurgedItem] = useState<TrashItem | null>(null);
  const cursor = pageCursors[pageIndex] ?? null;

  useEffect(() => {
    let active = true;
    void repository
      .listPage(cursor, PAGE_SIZE)
      .then((page) => {
        if (!active) return;
        if (page.items.length === 0 && pageIndex > 0) {
          setPageIndex((current) => current - 1);
          return;
        }
        setItems(page.items);
        setTotalCount(page.totalCount);
        setNextCursor(page.nextCursor);
      })
      .catch(() => {
        if (!active) return;
        toast.add({
          data: { type: "error" },
          description: "Nie udało się pobrać usuniętych elementów.",
        });
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [cursor, pageIndex, reloadKey]);

  async function restore(item: TrashItem, node: TrashTreeNode) {
    setPending(node.id);
    try {
      await repository.restoreNode(item.id, node);
      setLoading(true);
      setReloadKey((current) => current + 1);
      toast.add({
        data: { type: "success" },
        description:
          node.type === "chapter"
            ? "Przywrócono rozdział, jego moduł i należące do niego tematy."
            : node.type === "topic"
              ? "Przywrócono temat wraz z jego rozdziałem i modułem."
              : "Element został przywrócony.",
      });
    } catch {
      toast.add({
        data: { type: "error" },
        description:
          "Nie udało się przywrócić elementu. Sprawdź, czy jego nazwa nie jest już używana.",
      });
    } finally {
      setPending(null);
    }
  }

  async function purge(item: TrashItem) {
    setPending(item.id);
    try {
      await repository.purge(item.id);
      setPurgedItem(null);
      setLoading(true);
      setReloadKey((current) => current + 1);
      toast.add({
        data: { type: "success" },
        description: "Element został trwale usunięty.",
      });
    } catch {
      toast.add({
        data: { type: "error" },
        description: "Nie udało się trwale usunąć elementu.",
      });
    } finally {
      setPending(null);
    }
  }

  function openNextPage() {
    if (!nextCursor) return;
    setLoading(true);
    setPageCursors((current) => [
      ...current.slice(0, pageIndex + 1),
      nextCursor,
    ]);
    setPageIndex((current) => current + 1);
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div>
        <header>
          <p className="text-sm font-medium text-primary">Kosz</p>
          <h1 className="mt-1 text-3xl font-semibold">Usunięte elementy</h1>
          <p className="mt-2 text-muted-foreground">
            Każda operacja usunięcia jest osobnym drzewem. Elementy są
            automatycznie trwale usuwane po 24 godzinach.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? "Ładowanie kosza…"
              : `${totalCount} ${totalCount === 1 ? "element" : "elementów"}`}
          </p>
        </header>
        {loading ? (
          <div className="mt-16 flex justify-center">
            <LoaderCircle className="animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed py-16 text-center text-muted-foreground">
            Nie masz żadnych usuniętych elementów.
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {items.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border bg-background p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-primary">
                      {labels[item.item_type]}
                    </p>
                    <h2 className="mt-1 truncate font-semibold">
                      {item.title}
                    </h2>
                    {item.source_path.length > 0 && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Pochodzi z: {item.source_path.join(" / ")}
                      </p>
                    )}
                    <p className="mt-1 text-sm text-muted-foreground">
                      Trwałe usunięcie:{" "}
                      {deletionDateFormatter.format(new Date(item.purge_after))}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      disabled={pending !== null}
                      onClick={() => void restore(item, item.tree)}
                    >
                      <RotateCcw />
                      {item.tree.children.length > 0
                        ? "Przywróć wszystko"
                        : "Przywróć"}
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={pending !== null}
                      onClick={() => setPurgedItem(item)}
                    >
                      <Trash2 /> Usuń teraz
                    </Button>
                  </div>
                </div>

                {(item.tree.children.length > 0 || !item.tree.is_deleted) && (
                  <div className="mt-4 rounded-lg border bg-muted/15 px-3 py-2">
                    <TrashNode
                      item={item}
                      node={item.tree}
                      root
                      pending={pending}
                      onRestore={restore}
                    />
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {!loading && (pageIndex > 0 || nextCursor) && (
          <nav
            className="mt-6 flex items-center justify-between gap-4"
            aria-label="Paginacja kosza"
          >
            <p className="text-sm text-muted-foreground">
              Strona {pageIndex + 1}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={pageIndex === 0}
                onClick={() => {
                  setLoading(true);
                  setPageIndex((current) => current - 1);
                }}
              >
                <ChevronLeft /> Poprzednia
              </Button>
              <Button
                variant="outline"
                disabled={!nextCursor}
                onClick={openNextPage}
              >
                Następna <ChevronRight />
              </Button>
            </div>
          </nav>
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
                To drzewo i cała nadal należąca do niego zawartość zostaną
                usunięte bez możliwości przywrócenia.
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

function TrashNode({
  item,
  node,
  root = false,
  pending,
  onRestore,
}: {
  item: TrashItem;
  node: TrashTreeNode;
  root?: boolean;
  pending: string | null;
  onRestore: (item: TrashItem, node: TrashTreeNode) => Promise<void>;
}) {
  return (
    <div>
      <div className="flex min-w-0 items-center gap-2 py-1.5">
        <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-primary">
          {labels[node.type]}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {node.title}
        </span>
        {!node.is_deleted && (
          <span className="shrink-0 text-xs text-muted-foreground">
            aktywny rodzic
          </span>
        )}
        {!root && node.is_deleted && (
          <Button
            variant="ghost"
            size="xs"
            disabled={pending !== null}
            aria-label={`Przywróć ${labels[node.type].toLocaleLowerCase("pl")} ${node.title}`}
            onClick={() => void onRestore(item, node)}
          >
            {pending === node.id ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <RotateCcw />
            )}
            Przywróć
          </Button>
        )}
      </div>
      {node.children.length > 0 && (
        <div className="ml-3 border-l pl-3">
          {node.children.map((child) => (
            <TrashNode
              key={child.id}
              item={item}
              node={child}
              pending={pending}
              onRestore={onRestore}
            />
          ))}
        </div>
      )}
    </div>
  );
}
