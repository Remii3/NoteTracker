import { useRef, useState, type DragEvent } from "react";
import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
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
import type { TopicImagesService } from "../data/topic-images-service";
import { useTopicImages } from "../hooks/use-topic-images";
import type { TopicImage } from "../model/topic-image";
import { ImagePreviewDialog } from "./image-preview-dialog";

type Props = {
  topicId: string;
  isEditing: boolean;
  service?: TopicImagesService;
};

export function TopicImagesSection({ topicId, isEditing, service }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TopicImage | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { error, images, isLoading, isUploading, remove, removingId, upload } =
    useTopicImages(service, topicId);

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

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (!isEditing || isUploading) return;
    void uploadFiles([...event.dataTransfer.files]);
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {images.map((image) => (
                <div
                  key={image.id}
                  className="group relative overflow-hidden rounded-lg border bg-muted/20"
                >
                  <button
                    type="button"
                    className="block aspect-4/3 w-full cursor-zoom-in"
                    onClick={() => setPreviewId(image.id)}
                  >
                    <img
                      src={image.url}
                      alt={image.originalFilename}
                      loading="lazy"
                      className="size-full object-contain"
                    />
                  </button>
                  {isEditing && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon-sm"
                      className="absolute top-2 right-2 opacity-100 shadow-sm sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                      disabled={removingId === image.id}
                      aria-label={`Usuń ${image.originalFilename}`}
                      onClick={() => setPendingDelete(image)}
                    >
                      {removingId === image.id ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <Trash2 />
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
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
