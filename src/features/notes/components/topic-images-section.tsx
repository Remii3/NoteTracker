import { useRef, useState, type DragEvent as ReactDragEvent } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { TopicImagesService } from "../data/topic-images-service";
import { useTopicImages } from "../hooks/use-topic-images";
import type { TopicImage } from "../model/topic-image";
import { ImagePreviewDialog } from "./image-preview-dialog";

type Props = {
  topicId: string;
  isEditing: boolean;
  service?: TopicImagesService;
};

type SortableImageProps = {
  image: TopicImage;
  isEditing: boolean;
  disabled: boolean;
  isRemoving: boolean;
  onOpen: () => void;
  onRemove: () => void;
};

function SortableImage({
  image,
  isEditing,
  disabled,
  isRemoving,
  onOpen,
  onRemove,
}: SortableImageProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.id, disabled: !isEditing || disabled });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-muted/20",
        isDragging && "z-10 opacity-60 shadow-lg",
      )}
    >
      <button
        type="button"
        className="block aspect-4/3 w-full cursor-zoom-in"
        onClick={onOpen}
      >
        <img
          src={image.url}
          alt={image.originalFilename}
          loading="lazy"
          className="size-full object-contain"
        />
      </button>
      {isEditing && (
        <>
          <button
            type="button"
            className="absolute top-2 left-2 grid size-8 touch-none cursor-grab place-items-center rounded-md border bg-background/90 text-muted-foreground opacity-100 shadow-sm backdrop-blur sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 active:cursor-grabbing"
            disabled={disabled}
            aria-label={`Przeciągnij ${image.originalFilename}, aby zmienić kolejność`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
          <Button
            type="button"
            variant="destructive"
            size="icon-sm"
            className="absolute top-2 right-2 opacity-100 shadow-sm sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            disabled={disabled}
            aria-label={`Usuń ${image.originalFilename}`}
            onClick={onRemove}
          >
            {isRemoving ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Trash2 />
            )}
          </Button>
        </>
      )}
    </div>
  );
}

export function TopicImagesSection({ topicId, isEditing, service }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TopicImage | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const {
    error,
    images,
    isLoading,
    isReordering,
    isUploading,
    remove,
    removingId,
    reorder,
    upload,
  } = useTopicImages(service, topicId);

  async function uploadFiles(files: File[]) {
    const result = await upload(files);
    if (!result) return;
    if (result.uploaded.length)
      toast.success(
        result.uploaded.length === 1
          ? "Dodano zdjęcie."
          : `Dodano ${result.uploaded.length} zdjęć.`,
      );
    if (result.failed.length) {
      toast.error(
        result.uploaded.length
          ? `Nie udało się dodać ${result.failed.length} z ${files.length} zdjęć.`
          : "Nie udało się dodać zdjęć.",
      );
    }
  }

  function handleDrop(event: ReactDragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (!isEditing || isUploading) return;
    void uploadFiles([...event.dataTransfer.files]);
  }

  function handleReorder(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || isReordering) return;
    const from = images.findIndex((image) => image.id === active.id);
    const to = images.findIndex((image) => image.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(images, from, to);
    void reorder(next.map((image) => image.id)).then((saved) => {
      if (!saved) toast.error("Nie udało się zapisać kolejności zdjęć.");
    });
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold">Zdjęcia</h3>
          <p className="text-sm text-muted-foreground">
            Prywatne, widoczne tylko dla Ciebie.
          </p>
        </div>
        {isEditing && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading || !service}
            onClick={() => inputRef.current?.click()}
          >
            {isUploading ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <ImagePlus />
            )}
            {isUploading ? "Dodawanie…" : "Dodaj zdjęcia"}
          </Button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          void uploadFiles(files);
        }}
      />

      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}

      {isLoading ? (
        <div
          aria-label="Ładowanie zdjęć"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="aspect-4/3 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          {images.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleReorder}
            >
              <SortableContext
                items={images.map((image) => image.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {images.map((image) => (
                    <SortableImage
                      key={image.id}
                      image={image}
                      isEditing={isEditing}
                      disabled={
                        isUploading || isReordering || Boolean(removingId)
                      }
                      isRemoving={removingId === image.id}
                      onOpen={() => setPreviewId(image.id)}
                      onRemove={() => setPendingDelete(image)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {isEditing && (
            <button
              type="button"
              disabled={isUploading || !service}
              className={`mt-4 flex h-44 w-full flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 text-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50 ${
                isDragging ? "border-primary bg-primary/5" : ""
              }`}
              onClick={() => inputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              {isUploading ? (
                <LoaderCircle className="mb-3 size-7 animate-spin text-muted-foreground" />
              ) : (
                <ImagePlus className="mb-3 size-7 text-muted-foreground" />
              )}
              <span>
                {isUploading
                  ? "Przygotowywanie zdjęć…"
                  : "Przeciągnij zdjęcia tutaj"}
              </span>
              <span className="text-xs text-muted-foreground">
                JPG, PNG lub WebP, maksymalnie 10 MB
              </span>
            </button>
          )}

          {!isEditing && images.length === 0 && (
            <div className="grid h-44 place-items-center rounded-lg border border-dashed bg-muted/20 text-sm text-muted-foreground">
              Brak zdjęć.
            </div>
          )}
        </>
      )}

      <ImagePreviewDialog
        images={images}
        previewId={previewId}
        onPreviewChange={setPreviewId}
      />

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent className="sm:max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć zdjęcie?</AlertDialogTitle>
            <AlertDialogDescription>
              Tej operacji nie można cofnąć. Zdjęcie zostanie trwale usunięte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!pendingDelete) return;
                const imageId = pendingDelete.id;
                setPendingDelete(null);
                void remove(imageId).then((removed) => {
                  if (removed) toast.success("Usunięto zdjęcie.");
                });
              }}
            >
              Usuń zdjęcie
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
